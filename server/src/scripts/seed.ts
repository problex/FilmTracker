import { db as dbPromise } from "../db/db.js";
import { filmSeeds } from "../catalog/films.js";
import { storeSeeds } from "../catalog/stores.js";

async function main() {
  const db = await dbPromise;
  for (const s of storeSeeds) {
    await db.query(
      `
      INSERT INTO stores (id, name, province, base_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        province = EXCLUDED.province,
        base_url = EXCLUDED.base_url
      `,
      [s.id, s.name, s.province, s.baseUrl]
    );
  }

  for (const f of filmSeeds) {
    await db.query(
      `
      INSERT INTO films (id, brand, name, iso, type, process)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        brand = EXCLUDED.brand,
        name = EXCLUDED.name,
        iso = EXCLUDED.iso,
        type = EXCLUDED.type,
        process = EXCLUDED.process
      `,
      [f.id, f.brand, f.name, f.iso, f.type, f.process]
    );

    for (const a of f.aliases) {
      await db.query(
        `
        INSERT INTO film_aliases (film_id, alias)
        VALUES ($1, $2)
        ON CONFLICT (film_id, alias) DO NOTHING
        `,
        [f.id, a]
      );
    }
  }

  console.log("Seed complete.");
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

