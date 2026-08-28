import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const schema = await readFile(resolve(root, "docs/postgresql-schema-draft.sql"), "utf8");

try {
  await pool.query(schema);
  console.log("PostgreSQL schema applied for Almatjar Alalami Syria");
} finally {
  await pool.end();
}
