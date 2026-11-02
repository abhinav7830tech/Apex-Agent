import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type BootstrapStatement = {
  text: string;
  params?: unknown[];
};

export interface BootstrapClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction(statements: BootstrapStatement[]): Promise<void>;
}

export type BootstrapErrorCode =
  | "MISSING_DATABASE_URL"
  | "INVALID_METADATA"
  | "INVALID_DATABASE"
  | "EXISTING_DATABASE"
  | "INCOMPATIBLE_HISTORY"
  | "INCOMPLETE_BASELINE"
  | "UNSAFE_BASELINE_STATEMENT"
  | "BOOTSTRAP_TRANSACTION_FAILED"
  | "MIGRATION_RUNNER_FAILED"
  | "HISTORY_VERIFICATION_FAILED";

export class BootstrapError extends Error {
  readonly code: BootstrapErrorCode;

  constructor(code: BootstrapErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BootstrapError";
    this.code = code;
  }
}

export type MigrationEntry = {
  idx: number;
  tag: string;
  when: number;
  hash: string;
};

export type BootstrapPlan = {
  projectRoot: string;
  migrationsFolder: string;
  baselinePath: string;
  baselineStatements: string[];
  entries: MigrationEntry[];
  baselineEntry: MigrationEntry;
};

export type DatabaseState =
  | { state: "fresh" }
  | { state: "initialized"; applied: number };

export type InitializeResult = {
  status: "applied" | "already-initialized";
  applied: number;
};

export const EXPECTED_BASELINE_TABLES = [
  "account",
  "agents",
  "meetings",
  "notifications",
  "session",
  "user",
  "verification",
] as const;

export const EXPECTED_BASELINE_ENUMS: Record<string, readonly string[]> = {
  meeting_status: ["upcoming", "active", "completed", "processing", "cancelled"],
  notification_type: [
    "meeting_reminder",
    "meeting_started",
    "meeting_ended",
    "meeting_cancelled",
    "summary_ready",
  ],
};

const EXPECTED_BASELINE_TABLE_SET = new Set<string>(EXPECTED_BASELINE_TABLES);
const EXPECTED_BASELINE_ENUM_SET = new Set(Object.keys(EXPECTED_BASELINE_ENUMS));
const ALLOWED_DRIZZLE_RELATIONS = new Set([
  "__drizzle_migrations",
  "__drizzle_migrations_id_seq",
]);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const extractCommentedDdl = (source: string, filePath: string): string => {
  const lines = source.split("\n");
  const blockStart = lines.findIndex((line) => line.trim() === "/*");
  const blockEnd = lines.findIndex(
    (line, index) => index > blockStart && line.trim() === "*/",
  );

  if (blockStart < 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `${filePath} has no commented DDL block; the bootstrap provenance check cannot run.`,
    );
  }
  if (blockEnd < 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `${filePath} has an unterminated commented DDL block; the bootstrap provenance check cannot run.`,
    );
  }

  return `${lines.slice(blockStart + 1, blockEnd).join("\n")}\n`;
};

const validateBaselineStatement = (statement: string, index: number): void => {
  if (/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/i.test(statement)) {
    throw new BootstrapError(
      "UNSAFE_BASELINE_STATEMENT",
      `Baseline statement ${index + 1} contains transaction control. The baseline must run entirely inside the bootstrap transaction.`,
    );
  }
  if (/\bCONCURRENTLY\b/i.test(statement)) {
    throw new BootstrapError(
      "UNSAFE_BASELINE_STATEMENT",
      `Baseline statement ${index + 1} uses CONCURRENTLY, which cannot run inside a transaction.`,
    );
  }
  if (!statement.trimEnd().endsWith(";")) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `Baseline statement ${index + 1} does not end with a semicolon; refusing to execute an ambiguous statement.`,
    );
  }
};

export const loadBootstrapPlan = async (
  projectRoot = process.cwd(),
): Promise<BootstrapPlan> => {
  const migrationsFolder = path.join(projectRoot, "drizzle");
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const baselinePath = path.join(
    migrationsFolder,
    "bootstrap",
    "0000_pre_migration_baseline.sql",
  );

  let journalSource: string;
  try {
    journalSource = await readFile(journalPath, "utf8");
  } catch (error) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `Cannot read the Drizzle migration journal at ${journalPath}.`,
      { cause: error },
    );
  }

  let journal: { dialect?: string; entries?: Array<Record<string, unknown>> };
  try {
    journal = JSON.parse(journalSource) as typeof journal;
  } catch (error) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `The Drizzle migration journal at ${journalPath} is not valid JSON.`,
      { cause: error },
    );
  }

  if (journal.dialect !== "postgresql") {
    throw new BootstrapError(
      "INVALID_METADATA",
      `The Drizzle migration journal dialect is ${String(journal.dialect)}; expected postgresql.`,
    );
  }
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      "The Drizzle migration journal has no entries.",
    );
  }

  const entries: MigrationEntry[] = [];
  for (const [index, rawEntry] of journal.entries.entries()) {
    const tag = rawEntry.tag;
    const when = rawEntry.when;
    const idx = rawEntry.idx;

    if (
      typeof tag !== "string" ||
      tag.length === 0 ||
      typeof when !== "number" ||
      !Number.isSafeInteger(when) ||
      typeof idx !== "number" ||
      !Number.isSafeInteger(idx)
    ) {
      throw new BootstrapError(
        "INVALID_METADATA",
        `Migration journal entry ${index} is missing a valid tag, idx or when value.`,
      );
    }

    const migrationPath = path.join(migrationsFolder, `${tag}.sql`);
    let migrationSource: string;
    try {
      migrationSource = await readFile(migrationPath, "utf8");
    } catch (error) {
      throw new BootstrapError(
        "INVALID_METADATA",
        `Migration file ${migrationPath} referenced by the journal is missing or unreadable.`,
        { cause: error },
      );
    }

    entries.push({
      idx,
      tag,
      when,
      hash: sha256(migrationSource),
    });
  }

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].when <= entries[index - 1].when) {
      throw new BootstrapError(
        "INVALID_METADATA",
        `Migration journal timestamps are not strictly increasing: ${entries[index - 1].tag} (${entries[index - 1].when}) then ${entries[index].tag} (${entries[index].when}).`,
      );
    }
  }

  const baselineEntry = entries[0];
  if (!baselineEntry.tag.startsWith("0000_") || baselineEntry.idx !== 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `The first migration journal entry must be the 0000 baseline, found ${baselineEntry.tag} at idx ${baselineEntry.idx}.`,
    );
  }

  let baselineArtifact: string;
  try {
    baselineArtifact = await readFile(baselinePath, "utf8");
  } catch (error) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `Cannot read the pre-0001 bootstrap artifact at ${baselinePath}.`,
      { cause: error },
    );
  }

  let originalMigration: string;
  try {
    originalMigration = await readFile(
      path.join(migrationsFolder, `${baselineEntry.tag}.sql`),
      "utf8",
    );
  } catch (error) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `Cannot read the historical 0000 migration file for provenance validation.`,
      { cause: error },
    );
  }

  const expectedDdl = extractCommentedDdl(
    originalMigration,
    path.join(migrationsFolder, `${baselineEntry.tag}.sql`),
  );
  const ddlStart = baselineArtifact.indexOf("CREATE TYPE");
  if (ddlStart < 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `The pre-0001 bootstrap artifact at ${baselinePath} has no CREATE TYPE statement.`,
    );
  }

  const baselineDdl = baselineArtifact.slice(ddlStart);
  if (baselineDdl !== expectedDdl) {
    throw new BootstrapError(
      "INVALID_METADATA",
      `The pre-0001 bootstrap artifact has drifted from the commented DDL block in ${baselineEntry.tag}.sql. Refusing to apply it.`,
    );
  }

  const baselineStatements = baselineDdl
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (baselineStatements.length === 0) {
    throw new BootstrapError(
      "INVALID_METADATA",
      "The pre-0001 bootstrap artifact contains no executable statements.",
    );
  }

  baselineStatements.forEach(validateBaselineStatement);

  return {
    projectRoot,
    migrationsFolder,
    baselinePath,
    baselineStatements,
    entries,
    baselineEntry,
  };
};

type HistoryRow = {
  id: number | string;
  hash: string;
  created_at: unknown;
};

type HistoryTable = {
  exists: boolean;
  rows: HistoryRow[];
};

type CatalogRelation = {
  kind: string;
  name: string;
};

type CatalogType = {
  name: string;
  kind: string;
};

type CatalogRoutine = {
  name: string;
  kind: string;
};

type OtherSchemaObject = CatalogRelation & {
  schema: string;
};

type Catalog = {
  publicSchemaExists: boolean;
  publicRelations: CatalogRelation[];
  publicTypes: CatalogType[];
  publicRoutines: CatalogRoutine[];
  otherSchemaRelations: OtherSchemaObject[];
  otherSchemaTypes: (CatalogType & { schema: string })[];
  otherSchemaRoutines: (CatalogRoutine & { schema: string })[];
  drizzleRelations: CatalogRelation[];
  baselineTables: string[];
  baselineEnums: Record<string, string[]>;
};

const readHistoryTable = async (client: BootstrapClient): Promise<HistoryTable> => {
  const relation = await client.query<{ table_name: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS table_name`,
  );

  if (!relation[0]?.table_name) {
    return { exists: false, rows: [] };
  }

  const kind = await client.query<{ kind: string }>(
    `SELECT c.relkind AS kind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'drizzle' AND c.relname = '__drizzle_migrations'`,
  );

  if (!kind[0] || (kind[0].kind !== "r" && kind[0].kind !== "p")) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      "drizzle.__drizzle_migrations exists but is not an ordinary table. Refusing to use it.",
    );
  }

  const columns = await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default, is_identity
       FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position`,
  );

  const byName = new Map(columns.map((column) => [column.column_name, column]));
  const idColumn = byName.get("id");
  const hashColumn = byName.get("hash");
  const createdAtColumn = byName.get("created_at");

  const idHasDefault =
    Boolean(idColumn?.column_default) || idColumn?.is_identity === "YES";

  if (
    columns.length !== 3 ||
    !idColumn ||
    idColumn.data_type !== "integer" ||
    idColumn.is_nullable !== "NO" ||
    !idHasDefault ||
    !hashColumn ||
    hashColumn.data_type !== "text" ||
    hashColumn.is_nullable !== "NO" ||
    !createdAtColumn ||
    createdAtColumn.data_type !== "bigint"
  ) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      "drizzle.__drizzle_migrations does not have the Drizzle-compatible columns (id serial/integer primary key, hash text not null, created_at bigint). Refusing to write migration history.",
    );
  }

  const rows = await client.query<HistoryRow>(
    `SELECT id, hash, created_at
       FROM drizzle.__drizzle_migrations
      ORDER BY created_at ASC, id ASC`,
  );

  return { exists: true, rows };
};

const readCatalog = async (client: BootstrapClient): Promise<Catalog> => {
  const publicSchema = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') AS exists`,
  );

  const publicRelations = await client.query<CatalogRelation>(
    `SELECT c.relkind AS kind, c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ORDER BY c.relname`,
  );

  const publicTypes = await client.query<CatalogType>(
    `SELECT t.typname AS name, t.typtype AS kind
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typtype IN ('e', 'd')
        AND t.typname !~ '^_'
      ORDER BY t.typname`,
  );

  const publicRoutines = await client.query<CatalogRoutine>(
    `SELECT p.proname AS name, p.prokind AS kind
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname`,
  );

  const otherSchemaRelations = await client.query<OtherSchemaObject>(
    `SELECT n.nspname AS schema, c.relkind AS kind, c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('public', 'drizzle', 'information_schema')
        AND n.nspname !~ '^pg_'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ORDER BY n.nspname, c.relname`,
  );

  const otherSchemaTypes = await client.query<CatalogType & { schema: string }>(
    `SELECT n.nspname AS schema, t.typname AS name, t.typtype AS kind
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('public', 'drizzle', 'information_schema')
        AND n.nspname !~ '^pg_'
        AND t.typtype IN ('e', 'd')
        AND t.typname !~ '^_'
      ORDER BY n.nspname, t.typname`,
  );

  const otherSchemaRoutines = await client.query<CatalogRoutine & { schema: string }>(
    `SELECT n.nspname AS schema, p.proname AS name, p.prokind AS kind
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('public', 'drizzle', 'information_schema')
        AND n.nspname !~ '^pg_'
      ORDER BY n.nspname, p.proname`,
  );

  const drizzleRelations = await client.query<CatalogRelation>(
    `SELECT c.relkind AS kind, c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'drizzle'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ORDER BY c.relname`,
  );

  const baselineTables = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name IN ('account', 'agents', 'meetings', 'notifications', 'session', 'user', 'verification')
      ORDER BY table_name`,
  );

  const baselineEnumRows = await client.query<{ name: string; value: string }>(
    `SELECT t.typname AS name, e.enumlabel AS value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname IN ('meeting_status', 'notification_type')
      ORDER BY t.typname, e.enumsortorder`,
  );

  const baselineEnums: Record<string, string[]> = {};
  for (const row of baselineEnumRows) {
    const values = baselineEnums[row.name] ?? [];
    values.push(row.value);
    baselineEnums[row.name] = values;
  }

  return {
    publicSchemaExists: Boolean(publicSchema[0]?.exists),
    publicRelations,
    publicTypes,
    publicRoutines,
    otherSchemaRelations,
    otherSchemaTypes,
    otherSchemaRoutines,
    drizzleRelations,
    baselineTables: baselineTables.map((row) => row.table_name),
    baselineEnums,
  };
};

const validateHistoryRows = (rows: HistoryRow[], plan: BootstrapPlan): void => {
  const normalized = rows.map((row) => {
    if (row.created_at === null || row.created_at === undefined) {
      throw new BootstrapError(
        "INCOMPATIBLE_HISTORY",
        "drizzle.__drizzle_migrations contains a row with a null created_at; Drizzle's runner cannot order this history.",
      );
    }

    const createdAt = Number(row.created_at);
    if (!Number.isSafeInteger(createdAt)) {
      throw new BootstrapError(
        "INCOMPATIBLE_HISTORY",
        `drizzle.__drizzle_migrations contains an invalid created_at value: ${String(row.created_at)}.`,
      );
    }

    return { ...row, createdAt };
  });

  const createdAtValues = normalized.map((row) => row.createdAt);
  if (new Set(createdAtValues).size !== createdAtValues.length) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      "drizzle.__drizzle_migrations contains duplicate created_at values; Drizzle's latest-row lookup would be ambiguous.",
    );
  }

  const baselineRows = normalized.filter(
    (row) => row.createdAt === plan.baselineEntry.when,
  );
  if (baselineRows.length !== 1) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      `Migration history must contain exactly one ${plan.baselineEntry.tag} record, found ${baselineRows.length}. Refusing to skip or rewrite 0000.`,
    );
  }
  if (baselineRows[0].hash !== plan.baselineEntry.hash) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      `The ${plan.baselineEntry.tag} history hash does not match the preserved migration file. The migration file or history has been changed.`,
    );
  }

  if (normalized.length > plan.entries.length) {
    throw new BootstrapError(
      "INCOMPATIBLE_HISTORY",
      `Migration history has ${normalized.length} records but the journal only has ${plan.entries.length} entries.`,
    );
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const row = normalized[index];
    const entry = plan.entries[index];

    if (row.createdAt !== entry.when) {
      throw new BootstrapError(
        "INCOMPATIBLE_HISTORY",
        `Migration history is not a contiguous prefix of the journal. Expected ${entry.tag} at created_at ${entry.when}, found created_at ${row.createdAt}.`,
      );
    }
    if (row.hash !== entry.hash) {
      throw new BootstrapError(
        "INCOMPATIBLE_HISTORY",
        `Migration history hash mismatch for ${entry.tag}. The migration file or history has been changed.`,
      );
    }
  }
};

export const inspectDatabase = async (
  client: BootstrapClient,
  plan: BootstrapPlan,
): Promise<DatabaseState> => {
  const [history, catalog] = await Promise.all([
    readHistoryTable(client),
    readCatalog(client),
  ]);

  if (!catalog.publicSchemaExists) {
    throw new BootstrapError(
      "INVALID_DATABASE",
      "The database has no public schema. Create it before running db:init.",
    );
  }

  const unexpectedDrizzleRelations = catalog.drizzleRelations.filter(
    (relation) => !ALLOWED_DRIZZLE_RELATIONS.has(relation.name),
  );
  if (unexpectedDrizzleRelations.length > 0) {
    throw new BootstrapError(
      "EXISTING_DATABASE",
      `The drizzle schema contains unexpected objects: ${unexpectedDrizzleRelations
        .map((relation) => relation.name)
        .join(", ")}. Refusing to bootstrap over them.`,
    );
  }

  const otherSchemaObjects = [
    ...catalog.otherSchemaRelations.map(
      (object) => `${object.schema}.${object.name} (${object.kind})`,
    ),
    ...catalog.otherSchemaTypes.map(
      (object) => `${object.schema}.${object.name} (${object.kind})`,
    ),
    ...catalog.otherSchemaRoutines.map(
      (object) => `${object.schema}.${object.name} (${object.kind})`,
    ),
  ];
  if (otherSchemaObjects.length > 0) {
    throw new BootstrapError(
      "EXISTING_DATABASE",
      `The database contains objects outside public and drizzle: ${otherSchemaObjects.join(
        ", ",
      )}. Refusing to bootstrap over an existing database.`,
    );
  }

  if (!history.exists || history.rows.length === 0) {
    const publicObjects = [
      ...catalog.publicRelations.map(
        (object) => `${object.name} (${object.kind})`,
      ),
      ...catalog.publicTypes.map((object) => `${object.name} (${object.kind})`),
      ...catalog.publicRoutines.map((object) => `${object.name} (${object.kind})`),
    ];

    if (publicObjects.length > 0) {
      throw new BootstrapError(
        "EXISTING_DATABASE",
        `The public schema is not empty and has no registered 0000 migration: ${publicObjects.join(
          ", ",
        )}. Refusing to bootstrap over an existing application schema.`,
      );
    }

    return { state: "fresh" };
  }

  validateHistoryRows(history.rows, plan);

  const applied = history.rows.length;
  const existingBaselineTables = new Set(catalog.baselineTables);
  const missingTables = EXPECTED_BASELINE_TABLES.filter(
    (table) => !existingBaselineTables.has(table),
  );
  if (missingTables.length > 0) {
    throw new BootstrapError(
      "INCOMPLETE_BASELINE",
      `Migration history says ${plan.baselineEntry.tag} is applied, but the baseline tables are missing: ${missingTables.join(
        ", ",
      )}. Refusing to continue.`,
    );
  }

  const missingEnums = [...EXPECTED_BASELINE_ENUM_SET].filter(
    (name) => !catalog.baselineEnums[name],
  );
  if (missingEnums.length > 0) {
    throw new BootstrapError(
      "INCOMPLETE_BASELINE",
      `Migration history says ${plan.baselineEntry.tag} is applied, but the baseline enums are missing: ${missingEnums.join(
        ", ",
      )}. Refusing to continue.`,
    );
  }

  if (applied === 1) {
    const unexpectedRelations = catalog.publicRelations.filter(
      (relation) =>
        relation.kind !== "r" || !EXPECTED_BASELINE_TABLE_SET.has(relation.name),
    );
    const unexpectedTypes = catalog.publicTypes.filter(
      (type) => !EXPECTED_BASELINE_ENUM_SET.has(type.name),
    );

    if (
      unexpectedRelations.length > 0 ||
      unexpectedTypes.length > 0 ||
      catalog.publicRoutines.length > 0
    ) {
      throw new BootstrapError(
        "INCOMPLETE_BASELINE",
        "Only the 0000 history record is present, but the public schema does not exactly match the pre-0001 baseline. Refusing to treat it as a completed baseline.",
      );
    }

    for (const [name, expectedValues] of Object.entries(EXPECTED_BASELINE_ENUMS)) {
      const actualValues = catalog.baselineEnums[name];
      if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
        throw new BootstrapError(
          "INCOMPLETE_BASELINE",
          `The baseline enum ${name} has values ${JSON.stringify(
            actualValues,
          )}; expected ${JSON.stringify(expectedValues)}.`,
        );
      }
    }
  }

  return { state: "initialized", applied };
};

export const initializeFreshDatabase = async (
  client: BootstrapClient,
  plan: BootstrapPlan,
): Promise<InitializeResult> => {
  const before = await inspectDatabase(client, plan);
  if (before.state === "initialized") {
    return { status: "already-initialized", applied: before.applied };
  }

  const statements: BootstrapStatement[] = [
    { text: "SET LOCAL search_path = public, pg_temp" },
    { text: "CREATE SCHEMA IF NOT EXISTS drizzle" },
    {
      text: "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
    },
    ...plan.baselineStatements.map((text) => ({ text })),
    {
      text: "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      params: [plan.baselineEntry.hash, plan.baselineEntry.when],
    },
  ];

  try {
    await client.transaction(statements);
  } catch (error) {
    // A lost acknowledgement or a concurrent bootstrap can make the transaction
    // report failure after the server committed it. Re-inspect before claiming
    // that the database was left untouched.
    const afterFailure = await inspectDatabase(client, plan).catch(() => undefined);
    if (afterFailure?.state === "initialized") {
      return { status: "already-initialized", applied: afterFailure.applied };
    }

    throw new BootstrapError(
      "BOOTSTRAP_TRANSACTION_FAILED",
      "Baseline application failed and was rolled back. The database was not left partially bootstrapped. Fix the error and rerun `npm run db:init`.",
      { cause: error },
    );
  }

  const after = await inspectDatabase(client, plan);
  if (after.state !== "initialized" || after.applied < 1) {
    throw new BootstrapError(
      "HISTORY_VERIFICATION_FAILED",
      "The baseline transaction completed, but the baseline registration could not be verified.",
    );
  }

  return { status: "applied", applied: after.applied };
};

export const verifyAppliedHistory = async (
  client: BootstrapClient,
  plan: BootstrapPlan,
): Promise<void> => {
  const state = await inspectDatabase(client, plan);

  if (state.state !== "initialized") {
    throw new BootstrapError(
      "HISTORY_VERIFICATION_FAILED",
      "No migration history is registered after the runner completed.",
    );
  }

  if (state.applied !== plan.entries.length) {
    const missing = plan.entries.slice(state.applied).map((entry) => entry.tag);
    throw new BootstrapError(
      "HISTORY_VERIFICATION_FAILED",
      `Migration history has ${state.applied}/${plan.entries.length} records; missing: ${missing.join(
        ", ",
      )}.`,
    );
  }
};
