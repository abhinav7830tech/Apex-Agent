import "dotenv/config";
import { createNeonHttpClient } from "./drivers";
import {
  BootstrapError,
  initializeFreshDatabase,
  loadBootstrapPlan,
  verifyAppliedHistory,
} from "./fresh-initialization";
import { runDrizzleKitMigrate } from "./run-migrations";

const LOG_PREFIX = "[db:init]";

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new BootstrapError(
      "MISSING_DATABASE_URL",
      "DATABASE_URL is not set. Set it to a fresh, disposable PostgreSQL/Neon database before running db:init.",
    );
  }

  const projectRoot = process.cwd();
  const plan = await loadBootstrapPlan(projectRoot);
  const client = createNeonHttpClient(databaseUrl);

  console.log(
    `${LOG_PREFIX} baseline migration: ${plan.baselineEntry.tag} (created_at=${plan.baselineEntry.when})`,
  );

  const result = await initializeFreshDatabase(client, plan);
  if (result.status === "applied") {
    console.log(
      `${LOG_PREFIX} pre-0001 baseline applied and registered atomically.`,
    );
  } else {
    console.log(
      `${LOG_PREFIX} baseline already registered (${result.applied} migration record(s) in history).`,
    );
  }

  console.log(
    `${LOG_PREFIX} invoking standard Drizzle runner: drizzle-kit migrate`,
  );
  runDrizzleKitMigrate({ projectRoot });

  await verifyAppliedHistory(client, plan);
  console.log(
    `${LOG_PREFIX} verified ${plan.entries.length} migration record(s); database is fully migrated.`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} ${message}`);

  if (error instanceof BootstrapError && error.cause) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : String(error.cause);
    console.error(`${LOG_PREFIX} cause: ${cause}`);
  }

  process.exitCode = 1;
});
