// One-off migrator: wipes public schema and applies named migrations in order.
// Env required: DB_HOST, DB_PASSWORD. Optional: DB_PORT, DB_USER, DB_NAME, WIPE.
//
// Usage:
//   DB_HOST=... DB_PASSWORD=... node scripts/apply-migrations.mjs \
//     0001_full_schema.sql 0003_storage_buckets.sql 0004_design_storage.sql

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "supabase", "migrations");

const host = process.env.DB_HOST;
const password = process.env.DB_PASSWORD;
const port = parseInt(process.env.DB_PORT || "5432", 10);
const database = process.env.DB_NAME || "postgres";
const user = process.env.DB_USER || "postgres";
const wipe = process.env.WIPE === "1";

if (!host || !password) {
  console.error("Missing DB_HOST or DB_PASSWORD env vars");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node apply-migrations.mjs <file1.sql> [<file2.sql> ...]");
  process.exit(1);
}

const client = new pg.Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
});

async function main() {
  await client.connect();
  console.log(`[connected] ${user}@${host}:${port}/${database}`);

  if (wipe) {
    console.log("[wipe] dropping public schema and recreating");
    await client.query(`
      drop schema if exists public cascade;
      create schema public;
      grant all on schema public to postgres, anon, authenticated, service_role;
      grant usage on schema public to public;
    `);
  }

  for (const file of files) {
    const path = resolve(migrationsDir, file);
    const sql = readFileSync(path, "utf8");
    console.log(`[applying] ${file}  (${sql.length.toLocaleString()} bytes)`);
    try {
      await client.query(sql);
      console.log(`[ok] ${file}`);
    } catch (e) {
      console.error(`[error] ${file}: ${e.message}`);
      throw e;
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
