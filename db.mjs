import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the independent Almatjar backend");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export async function query(text, values = []) {
  return pool.query(text, values);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
