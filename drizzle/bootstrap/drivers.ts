import { neon } from "@neondatabase/serverless";
import type { PGlite } from "@electric-sql/pglite";
import type {
  BootstrapClient,
  BootstrapStatement,
} from "./fresh-initialization";

export const createNeonHttpClient = (connectionString: string): BootstrapClient => {
  const sql = neon(connectionString);

  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const rows = await sql.query(text, params);
      return rows as T[];
    },

    async transaction(statements: BootstrapStatement[]): Promise<void> {
      await sql.transaction((transaction) =>
        statements.map((statement) =>
          transaction.query(statement.text, statement.params),
        ),
      );
    },
  };
};

export const createPGliteClient = (db: PGlite): BootstrapClient => ({
  async query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await db.query<T>(text, params);
    return result.rows;
  },

  async transaction(statements: BootstrapStatement[]): Promise<void> {
    await db.transaction(async (transaction) => {
      for (const statement of statements) {
        await transaction.query(statement.text, statement.params);
      }
    });
  },
});
