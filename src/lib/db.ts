import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env, optionalEnv } from "./config";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env("DATABASE_URL"),
      ssl: optionalEnv("PGSSLMODE") === "disable" ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, values);
  return rows[0] ?? null;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
