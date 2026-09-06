import { runDiscovery } from "../discovery/discover.js";
import { db as dbPromise } from "../db/db.js";

// Default is read-only; --save records findings for review.
const persist = process.argv.includes("--save");

try {
  const r = await runDiscovery({ persist });
  console.log(`${r.found} unrecognised 35mm title(s)${persist ? `, ${r.newTitles} new` : ""}\n`);
  for (const t of r.titles) console.log(`  [${t.storeIds.join(", ")}] ${t.title}`);
  if (!persist && r.titles.length > 0) console.log("\n(read-only — pass --save to record these)");
} finally {
  await (await dbPromise).end();
}
