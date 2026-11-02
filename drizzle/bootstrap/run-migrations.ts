import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { BootstrapError } from "./fresh-initialization";

export type MigrationRunnerResult = {
  status: number | null;
  error?: Error;
};

export type MigrationRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    stdio: "inherit";
    env: NodeJS.ProcessEnv;
  },
) => MigrationRunnerResult;

export type RunDrizzleKitMigrateOptions = {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  runner?: MigrationRunner;
};

export const runDrizzleKitMigrate = (
  options: RunDrizzleKitMigrateOptions = {},
): void => {
  const projectRoot = options.projectRoot ?? process.cwd();
  const binPath = path.join(
    projectRoot,
    "node_modules",
    "drizzle-kit",
    "bin.cjs",
  );

  if (!existsSync(binPath)) {
    throw new BootstrapError(
      "MIGRATION_RUNNER_FAILED",
      `Cannot find drizzle-kit at ${binPath}. Install project dependencies before running db:init.`,
    );
  }

  const runner: MigrationRunner =
    options.runner ??
    ((command, args, spawnOptions) => {
      const result = spawnSync(command, args, spawnOptions);
      return { status: result.status, error: result.error };
    });

  const result = runner(process.execPath, [binPath, "migrate"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: options.env ?? process.env,
  });

  if (result.error) {
    throw new BootstrapError(
      "MIGRATION_RUNNER_FAILED",
      "drizzle-kit migrate could not be started. The baseline registration is committed; fix the runner error and rerun `npm run db:init`.",
      { cause: result.error },
    );
  }

  if (result.status !== 0) {
    throw new BootstrapError(
      "MIGRATION_RUNNER_FAILED",
      `drizzle-kit migrate exited with status ${
        result.status ?? "unknown"
      }. The baseline registration is committed; fix the migration failure and rerun \`npm run db:init\`. Already-applied migrations will be skipped.`,
    );
  }
};
