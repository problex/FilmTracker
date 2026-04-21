import { chromium, type Browser, type Page } from "playwright";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    const executablePath =
      process.env.CHROMIUM_PATH ??
      (await (async () => {
        // Alpine package usually installs one of these.
        const candidates = ["/usr/bin/chromium-browser", "/usr/bin/chromium"];
        for (const p of candidates) {
          try {
            await import("node:fs/promises").then((m) => m.access(p));
            return p;
          } catch {
            // continue
          }
        }
        return undefined;
      })());

    browserPromise = chromium.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox",
      ],
    });
  }
  return await browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } finally {
    browserPromise = null;
  }
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  // Reduce bandwidth.
  await context.route("**/*", async (route) => {
    const req = route.request();
    const type = req.resourceType();
    if (type === "image" || type === "font" || type === "media") {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

export async function extractRenderedText(page: Page) {
  // Use string evaluation to avoid DOM typings in Node TS.
  const v = await page.evaluate("document.body?.innerText ?? ''");
  return typeof v === "string" ? v : String(v ?? "");
}

