# Pre-0001 PostgreSQL bootstrap and fresh-database initialization

This directory contains a **separate bootstrap artifact**, not a Drizzle migration and not a
journal entry. It reconstructs the schema that migration `0001` expects to already exist, and it
provides the guarded command that registers the preserved `0000` migration before the standard
Drizzle runner applies `0001` through `0006`.

## Artifacts

| File | Purpose |
| --- | --- |
| `0000_pre_migration_baseline.sql` | Verbatim DDL from the commented block in `drizzle/0000_even_adam_warlock.sql`. |
| `0000_pre_migration_baseline.test.ts` | Provenance and mechanical schema comparison against `drizzle/meta/0000_snapshot.json`. |
| `fresh-initialization.ts` | Metadata validation, database-state classification, atomic baseline registration, and history verification. |
| `drivers.ts` | Neon HTTP and PGlite adapters for the bootstrap transaction interface. |
| `run-migrations.ts` | Invokes the standard `drizzle-kit migrate` runner and reports retry-safe failures. |
| `cli.ts` | Entry point for `npm run db:init`. |
| `fresh-initialization.test.ts` | Fresh, repeat, interrupted, failure, existing-database, history-integrity, and FK-truncation tests. |

Checksums (SHA-256) at creation time:

```text
7f12ae8e056a60236e165ba37f7568c28fc96018a2b6e87dfc036946b34f8f24  drizzle/bootstrap/0000_pre_migration_baseline.sql
f54a99059ffad8af14005fbfecb7f02e25a0a85794a02c4f0f87c913f8f56083  drizzle/0000_even_adam_warlock.sql
cc51f533b12a71150ac8dd02950f0b81039fc450583913c855ad669b3992c397  drizzle/meta/0000_snapshot.json
```

The historical files `drizzle/0000_even_adam_warlock.sql` through
`drizzle/0006_billing_atomic_operations.sql`, the snapshots, and
`drizzle/meta/_journal.json` are unchanged by this bootstrap workflow. `0000` remains a commented introspection dump whose
executable body is a no-op; it was not edited to create the baseline.

## Root cause: why `drizzle-kit migrate` cannot start from an empty database

`drizzle-kit migrate` uses Drizzle's `readMigrationFiles()` and `PgDialect.migrate()`:

1. It reads `drizzle/meta/_journal.json` in order and computes each migration's SHA-256 hash from
   the complete SQL file.
2. It splits each SQL file on the literal `--> statement-breakpoint` marker and executes every
   chunk.
3. It creates `drizzle.__drizzle_migrations` with `id`, `hash`, and `created_at`.
4. It selects only the row with the greatest `created_at` and applies journal entries whose
   `when` value is strictly greater than that `created_at`.
5. It runs the pending migrations and their history inserts inside one transaction.

`drizzle/0000_even_adam_warlock.sql` puts all of its DDL inside one block comment, but it also
contains `--> statement-breakpoint` markers inside that comment. The split therefore produces a
first chunk with an opening `/*` and no closing `*/`. The standard runner fails with
`ERROR: unterminated /* comment` before applying any migration.

This is a property of the preserved historical file, not PostgreSQL. Rewriting `0000`, removing
it from the journal, or changing its hash would break migration-history semantics. The safe fix
is to apply the DDL that `0000` intended, then register `0000` with its **exact original hash and
journal timestamp** so the standard runner skips it and starts at `0001`.

## Fresh database initialization

Use the dedicated command for a fresh, disposable database:

```bash
DATABASE_URL='postgres://...' npm run db:init
```

`npm run db:init` performs the following sequence:

1. Validates the journal, every migration file, and the baseline provenance before connecting.
2. Connects with the project's installed `@neondatabase/serverless` HTTP driver.
3. Refuses to continue unless the database is fresh or already has a valid, matching baseline
   registration.
4. In one transaction, applies the verified pre-`0001` baseline DDL and inserts the `0000`
   history row using the original file's SHA-256 hash and the journal's `when` value.
5. Invokes the standard `drizzle-kit migrate` runner, which applies `0001` through `0006` (and
   any later journal entries) with normal Drizzle hashing and timestamps.
6. Re-reads the migration history and fails loudly if any journal entry is missing, out of order,
   or has a hash that no longer matches its file.

The baseline and its history row are submitted through the Neon HTTP driver's
`sql.transaction([...])` API, which runs the statements as one non-interactive PostgreSQL
transaction. The PGlite test adapter uses an interactive transaction. If the baseline fails, the
schema and history row roll back together, so a retry starts from a clean database. If the
transaction reports failure after the server actually committed it, or a concurrent initialization
won the race, the command re-inspects the database and treats a valid completed baseline as
initialized instead of claiming that nothing was written.

`drizzle-kit migrate` uses Drizzle's PostgreSQL dialect transaction for the remaining migrations.
If a later migration fails, the runner rolls back all pending migrations, leaving the committed
baseline and its `0000` history row intact. Rerunning `npm run db:init` is then safe: the baseline
step is skipped and the standard runner retries the pending migrations.

### Accepted database states

| State | Action |
| --- | --- |
| Empty `public` schema, no history | Apply the baseline and register `0000`. |
| Empty `public` schema, empty `drizzle.__drizzle_migrations` | Apply the baseline and register `0000`. This can be left by an earlier runner attempt. |
| Valid `0000` history row and exact baseline schema | Skip the baseline and invoke the standard runner. |
| Valid history prefix containing `0000` and later migrations | Skip the baseline and invoke the standard runner; the runner skips already-applied entries. |
| Public objects without a `0000` history row | Reject. This prevents bootstrapping over an existing or partially initialized application schema. |
| History rows without a valid `0000` row, duplicate timestamps, or hash mismatches | Reject. |
| A `0000` history row without the baseline tables or enum values | Reject as an incomplete baseline. |
| Unexpected tables, types, routines, or schemas outside `public` and `drizzle` | Reject. |

The command is intentionally not an automatic repair tool. A partially applied baseline that did
not go through the transaction, a history table from another migration system, or a populated
schema requires operator inspection. The error identifies the unexpected objects or history
problem; the command does not drop or overwrite them.

### Normal migration runner

After `npm run db:init` has registered `0000` once, the standard command remains usable:

```bash
npm run db:migrate
```

It applies only journal entries newer than the latest history row. Running it before `db:init` on
an empty database still fails on the historical `0000` comment, by design; use `db:init` for the
first initialization.

## Baseline provenance and mechanical comparison

`drizzle/0000_even_adam_warlock.sql` contains its entire DDL inside a block comment. The DDL in
`0000_pre_migration_baseline.sql` is byte-identical to that block, including the Drizzle
statement-breakpoint markers (valid SQL comments). The provenance test and the `db:init` command
both fail if the artifact diverges from the commented block.

`npm run test:bootstrap` executes the baseline statements in the repository's in-process PGlite
engine and compares the resulting catalog with `drizzle/meta/0000_snapshot.json`.

Result: **no differences found** for the objects represented in the snapshot.

| Object | Snapshot | Bootstrap result |
| --- | --- | --- |
| Tables | 7 | 7, same names |
| Columns | 64 | 64, same names, types, nullability, defaults and primary-key flags |
| Enums | 2 | 2, same names, values and value order |
| Unique constraints | 2 (`user_email_unique`, `session_token_unique`) | 2, same names and columns |
| Foreign keys | 6 | 6, same names, column pairs, targets, `ON DELETE cascade`, `ON UPDATE no action` |
| Composite primary keys | 0 | 0 |
| Check constraints | 0 | 0 |
| Standalone indexes | 0 | 0 |
| RLS, policies, views, sequences, roles | none | none |

The comparison normalizes representation only, never schema meaning:

- Drizzle writes `timestamp`; PGlite reports `timestamp without time zone`. They are compared as
  the same type.
- Drizzle stores defaults as `now()`, `'upcoming'`, or JSON `false`; PGlite reports `now()`,
  `'upcoming'::meeting_status`, or `false`. Trailing casts and parenthesis wrappers are removed
  before comparison.
- Drizzle snapshot tables use `schema: ""` while enum `typeSchema` and foreign-key `schemaTo` use
  `public`. The empty table schema is Drizzle's snapshot convention for the default schema and is
  treated as `public`.

No missing definitions were invented and no DDL was normalized away.

## PostgreSQL validation completed in Phase 2B.7-C

An isolated disposable PostgreSQL 17.11 instance was used for the following validation. It did
not use Neon, production, or staging data.

- The baseline produced the expected 7 tables.
- Migrations `0001` through `0006` produced 20 tables, 2 enums, and 15 functions.
- Catalog comparison matched `drizzle/meta/0006_snapshot.json` for 221 columns, 11 unique
  constraints, 19 foreign keys, 24 check constraints, 30 indexes, and 15 functions.
- The only catalog differences were three foreign-key names truncated by PostgreSQL's 63-byte
  identifier limit, described below.
- All 15 functions were `SECURITY DEFINER` with `search_path=public, pg_temp`; none granted
  `EXECUTE` to `PUBLIC`.
- 64 functional tests passed on the real PostgreSQL instance, including separate-connection quota
  concurrency (five `reserved` results and one `quota_exceeded`) and idempotent duplicate
  reservation/commit behavior.
- The disposable cluster and temporary directories were removed after validation.

The `db:init` command's Neon HTTP transaction path was implemented against the installed
`@neondatabase/serverless` API but was not executed against Neon in this task. No Neon,
production, or staging database was contacted.

## Foreign-key identifier truncation

PostgreSQL truncates identifiers to `NAMEDATALEN - 1` = 63 bytes. Drizzle's snapshot files keep
the logical names generated by the schema, while PostgreSQL stores the effective names below.
Only the identifiers are truncated; the foreign-key definitions are unchanged.

| Table | Full snapshot name (length) | Effective PostgreSQL name (63 bytes) |
| --- | --- | --- |
| `grandfathering_cohort_members` | `grandfathering_cohort_members_batch_id_grandfathering_batches_id_fk` (67) | `grandfathering_cohort_members_batch_id_grandfathering_batches_i` |
| `grandfathering_cohort_members` | `grandfathering_cohort_members_billing_account_id_billing_accounts_id_fk` (71) | `grandfathering_cohort_members_billing_account_id_billing_accoun` |
| `meeting_start_reservations` | `meeting_start_reservations_billing_account_id_billing_accounts_id_fk` (68) | `meeting_start_reservations_billing_account_id_billing_accounts_` |

Do **not** rename these constraints in the historical migrations. Renaming would change the
preserved migration SQL and hashes. Schema verification should compare the foreign-key
definition (source table, source columns, target table, target columns, and delete/update actions)
and report the effective PostgreSQL name separately. The regression test in
`fresh-initialization.test.ts` derives the expected truncated names from the `0006` snapshot,
applies the full migration chain in PGlite, and verifies both the effective names and definitions.

## Assumptions and limitations

- The baseline assumes `public` is on the active `search_path`. `db:init` sets
  `search_path = public, pg_temp` inside the bootstrap transaction. The standard runner uses the
  connection's default search path, which normally includes `public`.
- PGlite is an in-process PostgreSQL-compatible engine, not a full PostgreSQL server. The tests
  cover SQL behavior and the shared Drizzle dialect, but not Neon HTTP networking, role/grant
  behavior, or multi-connection concurrency.
- The CLI uses the Neon HTTP driver from the installed `@neondatabase/serverless` package. It
  targets Neon-compatible endpoints; a plain local PostgreSQL server does not expose the Neon HTTP
  transaction endpoint used for the atomic baseline step. The core initialization logic and the
  transaction tests run against PGlite.
- The command does not compare the full final catalog to `0006_snapshot.json`; it verifies the
  migration history and baseline presence. Full catalog comparison was performed in Phase 2B.7-C
  on PostgreSQL, and the baseline comparison runs in `npm run test:bootstrap`.
- The command cannot detect whether `DATABASE_URL` points at production or staging. It can only
  refuse a database whose schema or history is not fresh/valid. Run it only against a database
  intended for initialization.
- Function ownership and runtime grants remain a separate privilege-bootstrap step. `db:init`
  does not create roles or grant `EXECUTE`; see `BILLING_PHASE_2B_6_OPERATIONS.md`.

Run the local checks with:

```bash
npm run test:bootstrap
```
