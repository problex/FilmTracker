import { runScrape } from "./run.js";
import { runAlerts } from "../alerts/run.js";

function parseHours(raw: string | undefined): number[] {
  const def = "0,12";
  const source = raw?.trim() || def;
  const nums = source.split(",").map((s) => Number(s.trim()));
  if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 23)) {
    console.warn(`Invalid SCRAPE_HOURS "${raw}"; using ${def}`);
    return def.split(",").map((s) => Number(s));
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

function msUntilNextRun(hours: readonly number[], now: Date): number {
  const nowMs = now.getTime();
  let best = Infinity;
  for (const h of hours) {
    const t = new Date(now);
    t.setHours(h, 0, 0, 0);
    if (t.getTime() <= nowMs) {
      t.setDate(t.getDate() + 1);
    }
    best = Math.min(best, t.getTime() - nowMs);
  }
  return best;
}

export function startScrapeScheduler() {
  const hours = parseHours(process.env.SCRAPE_HOURS);
  console.log(`Scrape scheduler: ${hours.length}x daily at hours ${hours.join(", ")} (server local time)`);

  const run = () => {
    void runScrape()
      .then(async (summary) => {
        const withErrors = summary.stores.filter((s) => s.errors.length > 0).length;
        console.log(`Scheduled scrape finished (${withErrors}/${summary.stores.length} stores reported errors)`);

        // After the scrape, never inside it. A mail outage or a bad API key must not
        // be able to mark a good scrape as failed — the health check reads that status.
        try {
          await runAlerts();
        } catch (e) {
          console.error("Price alerts failed:", e);
        }
      })
      .catch((e) => console.error("Scheduled scrape failed:", e));
  };

  const scheduleNext = () => {
    const delay = msUntilNextRun(hours, new Date());
    setTimeout(() => {
      run();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
