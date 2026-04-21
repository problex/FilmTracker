import { db as dbPromise } from "../db/db.js";
import { runScrape } from "../scrape/run.js";
import { closeBrowser } from "../stores/dakisBrowser.js";

async function main() {
  const summary = await runScrape();
  console.log(`Scrape complete: ${JSON.stringify(summary)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser().catch(() => undefined);
    const db = await dbPromise;
    await db.end();
  });

