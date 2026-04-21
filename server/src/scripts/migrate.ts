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

  // For v1 simplicity, we run all migrations (idempotent CREATE IF NOT EXISTS).
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, "utf8");
    console.log(`Running ${file}...`);
    await db.query(sql);
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

