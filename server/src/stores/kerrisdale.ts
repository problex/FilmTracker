import type { FilmSeed } from "../catalog/films.js";
import type { ListingCandidate, StoreAdapter } from "./types.js";
import { closeBrowser, extractRenderedText, withPage } from "./dakisBrowser.js";
import { isBulkRoll, looksLike35mm, parseExposures, parseMoneyToCents, parsePackSize } from "./shared.js";

function pickFirstProductFromText(text: string) {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Heuristic: search results typically include "$xx.xx" then brand line then product title then "Add To Cart".
  for (let i = 0; i < lines.length; i++) {
    const priceLine = lines[i];
    const m = priceLine.match(/^\$([0-9][0-9,]*(?:\.[0-9]{2})?)$/);
    if (!m?.[1]) continue;

    const title =
      lines.slice(i + 1, i + 8).find((l) => looksLike35mm(l)) ??
      lines.slice(i + 1, i + 8).find((l) => l.length > 8) ??
      null;

    const hasAddToCart = lines.slice(i, i + 12).some((l) => l.toLowerCase().includes("add to cart"));
    return { priceStr: m[1], title, inStock: hasAddToCart };
  }

  return null;
}

export const kerrisdaleAdapter: StoreAdapter = {
  storeId: "kerrisdale",
  storeName: "Kerrisdale Cameras",
  baseUrl: "https://kerrisdalecameras.com",

  async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
    const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`} 135`;
    const shopUrl = new URL("/shop", "https://kerrisdalecameras.com");
    shopUrl.searchParams.set("query", q);

    // Kerrisdale's search results often render product cards without real <a href="/shop/..."> links.
    // To avoid timeouts, parse the rendered results directly and use the search URL as the listing URL.
    try {
      return await withPage(async (page) => {
        await page.goto(shopUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(3500);

        const text = await extractRenderedText(page);
        const picked = pickFirstProductFromText(text);
        if (!picked?.priceStr || !picked.title) return [];

        const priceCadCents = parseMoneyToCents(picked.priceStr);
        if (priceCadCents == null) return [];
        const titleRaw = picked.title;
        if (!looksLike35mm(titleRaw) && !looksLike35mm(text)) return [];

        return [
          {
            url: shopUrl.toString(),
            titleRaw,
            priceCadCents,
            currency: "CAD",
            inStock: picked.inStock,
            packSize: parsePackSize(titleRaw) ?? parsePackSize(text),
            exposures: parseExposures(titleRaw) ?? parseExposures(text),
            isBulk: isBulkRoll(titleRaw) || isBulkRoll(text),
            lastCheckedAt: new Date(),
          },
        ];
      });
    } finally {
      // Ensure Playwright doesn't keep the process alive in CLI runs.
      await closeBrowser().catch(() => undefined);
    }
  },
};

