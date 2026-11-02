import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createPGliteClient } from "./drivers";
import {
  BootstrapError,
  initializeFreshDatabase,
  inspectDatabase,
  loadBootstrapPlan,
  verifyAppliedHistory,
  type BootstrapPlan,
} from "./fresh-initialization";
import { runDrizzleKitMigrate } from "./run-migrations";

const PROJECT_ROOT = process.cwd();
const MIGRATIONS_FOLDER = path.join(PROJECT_ROOT, "drizzle");
const FINAL_SNAPSHOT_PATH = path.join(
  PROJECT_ROOT,
  "drizzle",
  "meta",
  "0006_snapshot.json",
);

let planPromise: Promise<BootstrapPlan> | undefined;

const getPlan = () => {
  planPromise ??= loadBootstrapPlan(PROJECT_ROOT);
  return planPromise;
};

const createDatabase = (t: { after: (fn: () => unknown) => void }) => {
  const db = new PGlite();
  t.after(() => db.close());
  const client = createPGliteClient(db);

  return {
    db,
    client,
    drizzleDb: drizzle(db),
  };
};

const actionCode = (code: string) => {
  switch (code) {
    case "a":
      return "no action";
    case "r":
      return "restrict";
    case "c":
      return "cascade";
    case "n":
      return "set null";
    case "d":
      return "set default";
    default:
      return `unknown(${code})`;
  }
};

describe("fresh database initialization", () => {
  it("applies the baseline, registers 0000, and lets the standard runner apply 0001-0007", async (t) => {
    const plan = await getPlan();
    const { client, drizzleDb } = createDatabase(t);

    const result = await initializeFreshDatabase(client, plan);
    assert.equal(result.status, "applied");
    assert.equal(result.applied, 1);

    const baselineHistory = await client.query<{
      hash: string;
      created_at: string | number;
    }>(
      `SELECT hash, created_at
         FROM drizzle.__drizzle_migrations
        ORDER BY created_at ASC`,
    );

    assert.equal(baselineHistory.length, 1);
    assert.equal(baselineHistory[0].hash, plan.baselineEntry.hash);
    assert.equal(
      Number(baselineHistory[0].created_at),
      plan.baselineEntry.when,
    );

    const baselineState = await inspectDatabase(client, plan);
    assert.equal(baselineState.state, "initialized");
    assert.equal(baselineState.applied, 1);

    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
    await verifyAppliedHistory(client, plan);

    const history = await client.query<{
      hash: string;
      created_at: string | number;
    }>(
      `SELECT hash, created_at
         FROM drizzle.__drizzle_migrations
        ORDER BY created_at ASC`,
    );

    assert.equal(history.length, plan.entries.length);
    for (let index = 0; index < plan.entries.length; index += 1) {
      assert.equal(history[index].hash, plan.entries[index].hash);
      assert.equal(
        Number(history[index].created_at),
        plan.entries[index].when,
      );
    }

    const counts = await client.query<{
      tables: number;
      enums: number;
      functions: number;
    }>(
      `SELECT
         (SELECT count(*)::int
            FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
         (SELECT count(*)::int
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e') AS enums,
         (SELECT count(*)::int
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public') AS functions`,
    );

    assert.deepEqual(counts[0], { tables: 21, enums: 2, functions: 15 });
  });

  it("is idempotent when invoked again after bootstrap and after full migration", async (t) => {
    const plan = await getPlan();
    const { client, drizzleDb } = createDatabase(t);

    await initializeFreshDatabase(client, plan);

    const second = await initializeFreshDatabase(client, plan);
    assert.equal(second.status, "already-initialized");
    assert.equal(second.applied, 1);

    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

    const third = await initializeFreshDatabase(client, plan);
    assert.equal(third.status, "already-initialized");
    assert.equal(third.applied, plan.entries.length);

    await verifyAppliedHistory(client, plan);

    const count = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
    );
    assert.equal(count[0].count, plan.entries.length);
  });

  it("rolls back an interrupted baseline transaction and retries cleanly", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await assert.rejects(
      () =>
        initializeFreshDatabase(
          {
            query: client.query.bind(client),
            async transaction(statements) {
              await db.transaction(async (transaction) => {
                for (let index = 0; index < statements.length; index += 1) {
                  if (index === 5) {
                    throw new Error("simulated interruption");
                  }
                  await transaction.query(
                    statements[index].text,
                    statements[index].params,
                  );
                }
              });
            },
          },
          plan,
        ),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "BOOTSTRAP_TRANSACTION_FAILED" &&
        String(error.cause).includes("simulated interruption"),
    );

    const stateAfterFailure = await inspectDatabase(client, plan);
    assert.equal(stateAfterFailure.state, "fresh");

    const publicTables = await client.query<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    assert.deepEqual(publicTables, []);

    const retry = await initializeFreshDatabase(client, plan);
    assert.equal(retry.status, "applied");
    assert.equal(retry.applied, 1);
  });

  it("recognizes a committed baseline when the transaction acknowledgement is lost", async (t) => {
    const plan = await getPlan();
    const { client } = createDatabase(t);

    const result = await initializeFreshDatabase(
      {
        query: client.query.bind(client),
        async transaction(statements) {
          await client.transaction(statements);
          throw new Error("simulated lost acknowledgement");
        },
      },
      plan,
    );

    assert.equal(result.status, "already-initialized");
    assert.equal(result.applied, 1);

    const history = await client.query<{ created_at: string | number }>(
      `SELECT created_at
         FROM drizzle.__drizzle_migrations
        ORDER BY created_at ASC`,
    );
    assert.deepEqual(
      history.map((row) => Number(row.created_at)),
      [plan.baselineEntry.when],
    );
  });

  it("rejects a partially applied baseline instead of reusing or overwriting it", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await db.exec(
      `CREATE TYPE "public"."meeting_status" AS ENUM('upcoming', 'active', 'completed', 'processing', 'cancelled')`,
    );

    await assert.rejects(
      () => initializeFreshDatabase(client, plan),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "EXISTING_DATABASE",
    );

    const enums = await client.query<{ typname: string }>(
      `SELECT t.typname
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        ORDER BY t.typname`,
    );
    assert.deepEqual(
      enums.map((row) => row.typname),
      ["meeting_status"],
    );

    const history = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS table_name`,
    );
    assert.equal(history[0].table_name, null);
  });

  it("refuses to bootstrap over an existing application schema", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await db.exec(
      `CREATE TABLE "public"."existing_app_table" ("id" text PRIMARY KEY)`,
    );

    await assert.rejects(
      () => initializeFreshDatabase(client, plan),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "EXISTING_DATABASE" &&
        error.message.includes("existing_app_table"),
    );

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name`,
    );
    assert.deepEqual(
      tables.map((row) => row.table_name),
      ["existing_app_table"],
    );

    const history = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS table_name`,
    );
    assert.equal(history[0].table_name, null);
  });

  it("rejects migration history that does not include the registered baseline", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await db.exec(
      `CREATE SCHEMA drizzle;
       CREATE TABLE drizzle.__drizzle_migrations (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [plan.entries[1].hash, plan.entries[1].when],
    );

    await assert.rejects(
      () => initializeFreshDatabase(client, plan),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "INCOMPATIBLE_HISTORY",
    );

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    assert.deepEqual(tables, []);
  });

  it("rejects a baseline history row when the baseline schema is missing", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await db.exec(
      `CREATE SCHEMA drizzle;
       CREATE TABLE drizzle.__drizzle_migrations (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [plan.baselineEntry.hash, plan.baselineEntry.when],
    );

    await assert.rejects(
      () => initializeFreshDatabase(client, plan),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "INCOMPLETE_BASELINE",
    );

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    assert.deepEqual(tables, []);
  });

  it("rejects a baseline history row with a mismatched hash", async (t) => {
    const plan = await getPlan();
    const { db, client } = createDatabase(t);

    await db.exec(
      `CREATE SCHEMA drizzle;
       CREATE TABLE drizzle.__drizzle_migrations (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      ["0".repeat(64), plan.baselineEntry.when],
    );

    await assert.rejects(
      () => initializeFreshDatabase(client, plan),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "INCOMPATIBLE_HISTORY" &&
        error.message.includes("hash"),
    );
  });

  it("keeps the baseline registered when a later migration fails and retries safely", async (t) => {
    const plan = await getPlan();
    const { client, drizzleDb } = createDatabase(t);

    await initializeFreshDatabase(client, plan);

    const failureFolder = await mkdtemp(
      path.join(tmpdir(), "apex-drizzle-failure-"),
    );
    t.after(() => rm(failureFolder, { recursive: true, force: true }));

    await mkdir(path.join(failureFolder, "meta"), { recursive: true });
    await writeFile(
      path.join(failureFolder, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          {
            idx: 0,
            version: "7",
            when: plan.baselineEntry.when,
            tag: plan.baselineEntry.tag,
            breakpoints: true,
          },
          {
            idx: 1,
            version: "7",
            when: plan.baselineEntry.when + 1,
            tag: "0001_failing_probe",
            breakpoints: true,
          },
        ],
      }),
    );
    await writeFile(
      path.join(failureFolder, `${plan.baselineEntry.tag}.sql`),
      "/* test no-op */",
    );
    await writeFile(
      path.join(failureFolder, "0001_failing_probe.sql"),
      [
        `CREATE TABLE "public"."migration_failure_probe" ("id" text PRIMARY KEY);`,
        `ALTER TABLE "public"."missing_table" ADD COLUMN "x" text;`,
      ].join("\n--> statement-breakpoint\n"),
    );

    await assert.rejects(
      () => migrate(drizzleDb, { migrationsFolder: failureFolder }),
      /missing_table|does not exist/i,
    );

    const probe = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.migration_failure_probe')::text AS table_name`,
    );
    assert.equal(probe[0].table_name, null);

    const history = await client.query<{ created_at: string | number }>(
      `SELECT created_at
         FROM drizzle.__drizzle_migrations
        ORDER BY created_at ASC`,
    );
    assert.deepEqual(
      history.map((row) => Number(row.created_at)),
      [plan.baselineEntry.when],
    );

    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
    await verifyAppliedHistory(client, plan);
  });

  it("reports a non-zero drizzle-kit exit status with retry guidance", () => {
    assert.throws(
      () =>
        runDrizzleKitMigrate({
          projectRoot: PROJECT_ROOT,
          runner: () => ({ status: 1 }),
        }),
      (error) =>
        error instanceof BootstrapError &&
        error.code === "MIGRATION_RUNNER_FAILED" &&
        error.message.includes("rerun"),
    );

    assert.doesNotThrow(() =>
      runDrizzleKitMigrate({
        projectRoot: PROJECT_ROOT,
        runner: () => ({ status: 0 }),
      }),
    );
  });

  it("reports PostgreSQL's effective 63-byte names for the three truncated FKs", async (t) => {
    const plan = await getPlan();
    const { client, drizzleDb } = createDatabase(t);

    await initializeFreshDatabase(client, plan);
    await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

    const snapshot = JSON.parse(
      await readFile(FINAL_SNAPSHOT_PATH, "utf8"),
    ) as {
      tables: Record<
        string,
        {
          foreignKeys?: Record<
            string,
            {
              name: string;
              tableFrom: string;
              tableTo: string;
              columnsFrom: string[];
              columnsTo: string[];
              onDelete: string;
              onUpdate: string;
            }
          >;
        }
      >;
    };

    const expectedTruncated = Object.values(snapshot.tables).flatMap((table) =>
      Object.values(table.foreignKeys ?? {})
        .filter((foreignKey) => foreignKey.name.length > 63)
        .map((foreignKey) => ({
          ...foreignKey,
          effectiveName: foreignKey.name.slice(0, 63),
        })),
    );

    assert.equal(
      expectedTruncated.length,
      3,
      "0006_snapshot.json should contain exactly three FK names longer than PostgreSQL's 63-byte identifier limit",
    );

    const foreignKeys = await client.query<{
      name: string;
      table_name: string;
      referenced_table: string;
      columns: string[];
      referenced_columns: string[];
      on_delete: string;
      on_update: string;
    }>(
      `SELECT
         con.conname AS name,
         source.relname AS table_name,
         target.relname AS referenced_table,
         (SELECT array_agg(attribute.attname ORDER BY key.ord)
            FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ord)
            JOIN pg_attribute attribute
              ON attribute.attrelid = con.conrelid
             AND attribute.attnum = key.attnum) AS columns,
         (SELECT array_agg(attribute.attname ORDER BY key.ord)
            FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, ord)
            JOIN pg_attribute attribute
              ON attribute.attrelid = con.confrelid
             AND attribute.attnum = key.attnum) AS referenced_columns,
         con.confdeltype AS on_delete,
         con.confupdtype AS on_update
       FROM pg_constraint con
       JOIN pg_class source ON source.oid = con.conrelid
       JOIN pg_class target ON target.oid = con.confrelid
       JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
      WHERE con.contype = 'f' AND namespace.nspname = 'public'
      ORDER BY con.conname`,
    );

    const byName = new Map(foreignKeys.map((foreignKey) => [foreignKey.name, foreignKey]));

    for (const expected of expectedTruncated) {
      const actual = byName.get(expected.effectiveName);

      assert.ok(
        actual,
        `missing effective PostgreSQL FK name ${expected.effectiveName}`,
      );
      assert.equal(actual.name.length, 63);
      assert.equal(actual.name, expected.name.slice(0, 63));
      assert.equal(actual.table_name, expected.tableFrom);
      assert.deepEqual(actual.columns, expected.columnsFrom);
      assert.equal(actual.referenced_table, expected.tableTo);
      assert.deepEqual(actual.referenced_columns, expected.columnsTo);
      assert.equal(actionCode(actual.on_delete), expected.onDelete);
      assert.equal(actionCode(actual.on_update), expected.onUpdate);
    }
  });
});
