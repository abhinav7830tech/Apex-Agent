import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const BASELINE_PATH = "drizzle/bootstrap/0000_pre_migration_baseline.sql";
const ORIGINAL_MIGRATION_PATH = "drizzle/0000_even_adam_warlock.sql";
const SNAPSHOT_PATH = "drizzle/meta/0000_snapshot.json";

const EXPECTED_TABLES = [
  "account",
  "agents",
  "meetings",
  "notifications",
  "session",
  "user",
  "verification",
];

const EXPECTED_ENUMS = ["meeting_status", "notification_type"];

type SnapshotColumn = {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  default?: string | boolean | number;
};

type SnapshotForeignKey = {
  name: string;
  tableFrom: string;
  tableTo: string;
  schemaTo?: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete: string;
  onUpdate: string;
};

type SnapshotUniqueConstraint = {
  name: string;
  columns: string[];
};

type SnapshotTable = {
  name: string;
  columns: Record<string, SnapshotColumn>;
  indexes: Record<string, unknown>;
  foreignKeys: Record<string, SnapshotForeignKey>;
  uniqueConstraints: Record<string, SnapshotUniqueConstraint>;
  compositePrimaryKeys: Record<string, unknown>;
  checkConstraints: Record<string, unknown>;
};

type Snapshot = {
  tables: Record<string, SnapshotTable>;
  enums: Record<string, { name: string; values: string[]; schema: string }>;
};

type ExpectedColumn = {
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  default: string | null;
};

type ExpectedForeignKey = {
  tableFrom: string;
  tableTo: string;
  schemaTo: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete: string;
  onUpdate: string;
};

type ActualColumn = ExpectedColumn;
type ActualForeignKey = ExpectedForeignKey;

const applyBaseline = async (db: PGlite) => {
  const source = await readFile(BASELINE_PATH, "utf8");
  const statements = source
    .split(/--> statement-breakpoint\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  assert.ok(statements.length > 0, "baseline artifact contains no executable statements");
  for (const statement of statements) {
    await db.exec(statement);
  }
};

const rows = async <T>(db: PGlite, sql: string) => (await db.query<T>(sql)).rows;

const stripTrailingCast = (value: string) =>
  value.replace(/::(?:[A-Za-z_][\w$]*\.)?(?:"[^"]+"|[A-Za-z_][\w$]*)(?:\[\])?$/, "").trim();

const normalizeDefault = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  let normalized = stripTrailingCast(String(value).trim());
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
};

const mapColumnType = (dataType: string, udtName: string) => {
  switch (dataType) {
    case "text":
    case "boolean":
    case "integer":
      return dataType;
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
      return "timestamptz";
    case "ARRAY":
      return `${udtName.replace(/^_/, "")}[]`;
    case "USER-DEFINED":
      return udtName;
    default:
      return dataType;
  }
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

const expectedColumn = (column: SnapshotColumn): ExpectedColumn => ({
  type: column.type,
  notNull: column.notNull,
  primaryKey: column.primaryKey,
  default: normalizeDefault(column.default),
});

const introspect = async (db: PGlite) => {
  const columnRows = await rows<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    db,
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  );

  const primaryKeyRows = await rows<{ table_name: string; column_name: string }>(
    db,
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_catalog = tc.constraint_catalog
      AND kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
      AND kcu.table_catalog = tc.table_catalog
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY tc.table_name, kcu.ordinal_position`,
  );

  const uniqueRows = await rows<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    ordinal_position: number;
  }>(
    db,
    `SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_catalog = tc.constraint_catalog
      AND kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
      AND kcu.table_catalog = tc.table_catalog
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
     ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`,
  );

  const foreignKeyRows = await rows<{
    name: string;
    table_from: string;
    table_to: string;
    schema_to: string;
    columns_from: string[];
    columns_to: string[];
    on_delete: string;
    on_update: string;
  }>(
    db,
    `SELECT
       con.conname AS name,
       src.relname AS table_from,
       tgt.relname AS table_to,
       tgt_ns.nspname AS schema_to,
       (SELECT array_agg(a.attname ORDER BY key.ord)
          FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = key.attnum) AS columns_from,
       (SELECT array_agg(a.attname ORDER BY key.ord)
          FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = key.attnum) AS columns_to,
       con.confdeltype AS on_delete,
       con.confupdtype AS on_update
     FROM pg_constraint con
     JOIN pg_class src ON src.oid = con.conrelid
     JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
     JOIN pg_class tgt ON tgt.oid = con.confrelid
     JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
     WHERE con.contype = 'f' AND src_ns.nspname = 'public'
     ORDER BY src.relname, con.conname`,
  );

  const standaloneIndexRows = await rows<{ table_name: string; index_name: string }>(
    db,
    `SELECT t.relname AS table_name, i.relname AS index_name
     FROM pg_index ix
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_namespace n ON n.oid = i.relnamespace
     LEFT JOIN pg_constraint con ON con.conindid = i.oid
     WHERE n.nspname = 'public' AND con.oid IS NULL
     ORDER BY t.relname, i.relname`,
  );

  const checkConstraintRows = await rows<{ table_name: string; constraint_name: string }>(
    db,
    `SELECT rel.relname AS table_name, con.conname AS constraint_name
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE con.contype = 'c' AND n.nspname = 'public'
     ORDER BY rel.relname, con.conname`,
  );

  const enumRows = await rows<{ enum_name: string; enum_value: string }>(
    db,
    `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     ORDER BY t.typname, e.enumsortorder`,
  );

  const primaryKeysByTable = new Map<string, Set<string>>();
  for (const row of primaryKeyRows) {
    const keys = primaryKeysByTable.get(row.table_name) ?? new Set<string>();
    keys.add(row.column_name);
    primaryKeysByTable.set(row.table_name, keys);
  }

  const tables: Record<string, Record<string, ActualColumn>> = {};
  for (const row of columnRows) {
    const table = tables[row.table_name] ?? {};
    table[row.column_name] = {
      type: mapColumnType(row.data_type, row.udt_name),
      notNull: row.is_nullable === "NO",
      primaryKey: primaryKeysByTable.get(row.table_name)?.has(row.column_name) ?? false,
      default: normalizeDefault(row.column_default),
    };
    tables[row.table_name] = table;
  }

  const uniqueConstraints: Record<string, Record<string, string[]>> = {};
  for (const row of uniqueRows) {
    const table = uniqueConstraints[row.table_name] ?? {};
    const columns = table[row.constraint_name] ?? [];
    columns.push(row.column_name);
    table[row.constraint_name] = columns;
    uniqueConstraints[row.table_name] = table;
  }

  const foreignKeys: Record<string, Record<string, ActualForeignKey>> = {};
  for (const row of foreignKeyRows) {
    const table = foreignKeys[row.table_from] ?? {};
    table[row.name] = {
      tableFrom: row.table_from,
      tableTo: row.table_to,
      schemaTo: row.schema_to,
      columnsFrom: row.columns_from,
      columnsTo: row.columns_to,
      onDelete: actionCode(row.on_delete),
      onUpdate: actionCode(row.on_update),
    };
    foreignKeys[row.table_from] = table;
  }

  const enums: Record<string, string[]> = {};
  for (const row of enumRows) {
    const values = enums[row.enum_name] ?? [];
    values.push(row.enum_value);
    enums[row.enum_name] = values;
  }

  return {
    tables,
    uniqueConstraints,
    foreignKeys,
    standaloneIndexes: standaloneIndexRows,
    checkConstraints: checkConstraintRows,
    enums,
  };
};

const expectedForeignKeys = (table: SnapshotTable) =>
  Object.fromEntries(
    Object.entries(table.foreignKeys).map(([name, key]) => [
      name,
      {
        tableFrom: key.tableFrom,
        tableTo: key.tableTo,
        schemaTo: key.schemaTo ?? "public",
        columnsFrom: key.columnsFrom,
        columnsTo: key.columnsTo,
        onDelete: key.onDelete,
        onUpdate: key.onUpdate,
      } satisfies ExpectedForeignKey,
    ]),
  );

const expectedUniqueConstraints = (table: SnapshotTable) =>
  Object.fromEntries(
    Object.entries(table.uniqueConstraints).map(([name, constraint]) => [name, constraint.columns]),
  );

describe("pre-0001 bootstrap artifact", () => {
  it("keeps its DDL byte-identical to the commented block in 0000_even_adam_warlock.sql", async () => {
    const [original, artifact] = await Promise.all([
      readFile(ORIGINAL_MIGRATION_PATH, "utf8"),
      readFile(BASELINE_PATH, "utf8"),
    ]);

    const lines = original.split("\n");
    const blockStart = lines.findIndex((line) => line.trim() === "/*");
    const blockEnd = lines.findIndex((line, index) => index > blockStart && line.trim() === "*/");
    assert.ok(blockStart >= 0, `${ORIGINAL_MIGRATION_PATH} has no commented DDL block`);
    assert.ok(blockEnd > blockStart, `${ORIGINAL_MIGRATION_PATH} has an unterminated commented DDL block`);

    const expectedBody = `${lines.slice(blockStart + 1, blockEnd).join("\n")}\n`;
    const firstStatement = artifact.indexOf("CREATE TYPE");
    assert.ok(firstStatement >= 0, `${BASELINE_PATH} has no CREATE TYPE statement`);

    assert.equal(
      artifact.slice(firstStatement),
      expectedBody,
      `bootstrap DDL drifted from the commented block in ${ORIGINAL_MIGRATION_PATH}`,
    );
  });

  it("executes and matches drizzle/meta/0000_snapshot.json", async (t) => {
    const db = new PGlite();
    t.after(() => db.close());

    await applyBaseline(db);
    const actual = await introspect(db);

    const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as Snapshot;
    const expectedTables = Object.fromEntries(
      Object.values(snapshot.tables).map((table) => [table.name, table]),
    );

    assert.deepEqual(
      Object.keys(expectedTables).sort(),
      EXPECTED_TABLES,
      "0000_snapshot.json no longer describes the expected pre-0001 table set",
    );
    assert.deepEqual(
      Object.values(snapshot.enums).map((value) => value.name).sort(),
      EXPECTED_ENUMS,
      "0000_snapshot.json no longer describes the expected pre-0001 enum set",
    );

    assert.deepEqual(
      Object.keys(actual.tables).sort(),
      Object.keys(expectedTables).sort(),
      "table set differs from 0000_snapshot.json",
    );

    for (const [tableName, expectedTable] of Object.entries(expectedTables)) {
      assert.ok(actual.tables[tableName], `missing table expected by 0000_snapshot.json: ${tableName}`);

      const expectedColumns = Object.fromEntries(
        Object.entries(expectedTable.columns).map(([name, column]) => [name, expectedColumn(column)]),
      );
      assert.deepEqual(
        actual.tables[tableName],
        expectedColumns,
        `column definitions differ for table ${tableName}`,
      );

      assert.deepEqual(
        actual.uniqueConstraints[tableName] ?? {},
        expectedUniqueConstraints(expectedTable),
        `unique constraints differ for table ${tableName}`,
      );

      assert.deepEqual(
        actual.foreignKeys[tableName] ?? {},
        expectedForeignKeys(expectedTable),
        `foreign keys differ for table ${tableName}`,
      );

      assert.deepEqual(
        Object.keys(expectedTable.indexes),
        [],
        `0000_snapshot.json unexpectedly declares indexes on ${tableName}; update the comparison`,
      );
    }

    assert.deepEqual(
      actual.standaloneIndexes,
      [],
      "bootstrap created indexes not represented by constraints in 0000_snapshot.json",
    );
    assert.deepEqual(
      actual.checkConstraints,
      [],
      "0000_snapshot.json declares no check constraints, but the bootstrap created some",
    );

    const expectedEnums = Object.fromEntries(
      Object.values(snapshot.enums).map((value) => [value.name, value.values]),
    );
    assert.deepEqual(actual.enums, expectedEnums, "enum names, values or ordering differ from 0000_snapshot.json");
  });
});
