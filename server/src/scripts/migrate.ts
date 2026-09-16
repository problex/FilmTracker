import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db as dbPromise } from "../db/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const db = await dbPromise;

  const migrationsDir =
    db.dialect === "sqlite"
      ? path.join(__dirname, "..", "db", "migrations_sqlite")
      : path.join(__dirname, "..", "db", "migrations");

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  // Postgres migrations are idempotent (CREATE/ADD COLUMN IF NOT EXISTS), so every
  // file runs on every start. SQLite has no ADD COLUMN IF NOT EXISTS, so a second run
  // of 002 would fail on the duplicate column: record what has been applied instead.
  const tracked = db.dialect === "sqlite";
  const applied = new Set<string>();
  if (tracked) {
    await db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename TEXT PRIMARY KEY,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    );
    const { rows } = await db.query<{ filename: string }>("SELECT filename FROM schema_migrations");
    for (const row of rows) applied.add(row.filename);
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, "utf8");
    console.log(`Running ${file}...`);
    await db.exec(sql);
    if (tracked) await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
  }

  console.log("Migrations complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = await dbPromise;
    await db.end();
  });
