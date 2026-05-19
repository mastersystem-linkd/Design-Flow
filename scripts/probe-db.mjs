// Read-only DB probe: lists public tables, custom types, and key counts.
import pg from "pg";

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

await client.connect();

const tables = await client.query(`
  select tablename from pg_tables where schemaname = 'public' order by tablename
`);
const types = await client.query(`
  select t.typname
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e'
  order by typname
`);
const buckets = await client.query(`select id from storage.buckets order by id`);
const usersCount = await client.query(`select count(*)::int as n from auth.users`);

console.log("public tables :", tables.rows.map(r => r.tablename).join(", ") || "(none)");
console.log("public enums  :", types.rows.map(r => r.typname).join(", ") || "(none)");
console.log("storage buckets:", buckets.rows.map(r => r.id).join(", ") || "(none)");
console.log("auth.users count:", usersCount.rows[0].n);

await client.end();
