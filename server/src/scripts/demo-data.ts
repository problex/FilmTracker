import { randomUUID } from "node:crypto";
import { db as dbPromise } from "../db/db.js";

type DemoOffer = {
  storeId: string;
  filmId: string;
  url: string;
  titleRaw: string;
  packSize: number | null;
  priceCadCents: number;
  inStock: boolean;
};

const offers: DemoOffer[] = [
  {
    storeId: "aden-camera",
    filmId: "kodak-portra-400",
    url: "https://example.com/aden/portra-400",
    titleRaw: "Kodak Portra 400 35mm 36exp",
    packSize: 1,
    priceCadCents: 2399,
    inStock: true,
  },
  {
    storeId: "beau-photo",
    filmId: "kodak-portra-400",
    url: "https://example.com/beau/portra-400",
    titleRaw: "Kodak Portra 400 135-36",
    packSize: 1,
    priceCadCents: 2199,
    inStock: true,
  },
  {
    storeId: "the-camera-store",
    filmId: "kodak-portra-400",
    url: "https://example.com/tcs/portra-400",
    titleRaw: "Kodak Portra 400 35mm (single roll)",
    packSize: 1,
    priceCadCents: 2499,
    inStock: true,
  }
];

async function main() {
  const db = await dbPromise;
  for (const o of offers) {
    const listingId = randomUUID();
    await db.query(
      `
      INSERT INTO listings (id, store_id, film_id, url, title_raw, pack_size)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (store_id, url) DO UPDATE SET
        title_raw = EXCLUDED.title_raw,
        pack_size = EXCLUDED.pack_size,
        last_seen_at = CURRENT_TIMESTAMP
      `,
      [listingId, o.storeId, o.filmId, o.url, o.titleRaw, o.packSize]
    );

    const effectiveListing = await db.query<{ id: string }>(
      `SELECT id FROM listings WHERE store_id = $1 AND url = $2`,
      [o.storeId, o.url]
    );

    const id = effectiveListing.rows[0]?.id;
    if (!id) continue;

    await db.query(
      `
      INSERT INTO price_snapshots (listing_id, price_cad_cents, in_stock)
      VALUES ($1, $2, $3)
      `,
      [id, o.priceCadCents, o.inStock]
    );
  }

  console.log("Demo data inserted.");
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

