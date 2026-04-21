import type { FilmSeed } from "../catalog/films.js";
import type { ListingCandidate, StoreAdapter } from "./types.js";
import { fetchText, isBulkRoll, looksLike35mm, parseExposures, parseMoneyToCents, parsePackSize } from "./shared.js";

function buildSearchUrl(baseUrl: string, q: string) {
  const u = new URL("/", baseUrl);
  u.searchParams.set("s", q);
  u.searchParams.set("post_type", "product");
  return u.toString();
}

function extractProductLinks(baseUrl: string, html: string) {
  const links = new Set<string>();
  const re = /href=\"(https?:\/\/graination\.ca\/product\/[^\"?#]+\/)\"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) links.add(new URL(m[1], baseUrl).toString());
  return [...links];
}

function extractTitle(html: string) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

function extractPrice(html: string) {
  // WooCommerce: prefer price inside <p class="price">...</p>
  const priceBlock =
    html.match(/<p[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
    html.match(/<span[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ??
    null;

  const source = priceBlock ?? html;

  // Prefer explicit woocommerce amount spans if present
  const amount =
    // Currency symbol is often encoded as &#36; or inside a span
    source.match(/woocommerce-Price-amount[^>]*>\s*<bdi>[\s\S]*?([0-9]+(?:\.[0-9]{2})?)\s*<\/bdi>/i)?.[1] ??
    source.match(/&#36;\s*([0-9]+(?:\.[0-9]{2})?)/i)?.[1] ??
    source.match(/\$([0-9]+(?:\.[0-9]{2})?)/)?.[1] ??
    null;

  return amount;
}

function extractStock(html: string) {
  // WooCommerce stock usually appears as: <p class="stock in-stock">In stock</p>
  const m = html.match(/class="[^"]*\bstock\b[^"]*"\s*>\s*([^<]+)\s*</i);
  const txt = (m?.[1] ?? "").toLowerCase();
  if (!txt) {
    const w = html.match(/\b(in stock|out of stock)\b/i)?.[1];
    if (!w) return null;
    return w.toLowerCase().includes("in stock");
  }
  if (txt.includes("out of stock")) return false;
  if (txt.includes("in stock")) return true;
  return null;
}

async function fetchCandidateFromProductPage(url: string): Promise<ListingCandidate | null> {
  const html = await fetchText(url);
  const title = extractTitle(html);
  if (!title) return null;
  if (!looksLike35mm(title)) return null;

  const price = extractPrice(html);
  const priceCadCents = price ? parseMoneyToCents(price) : null;
  if (priceCadCents == null) return null;

  const inStock = extractStock(html) ?? false;

  return {
    url,
    titleRaw: title,
    priceCadCents,
    currency: "CAD",
    inStock,
    packSize: parsePackSize(title),
    exposures: parseExposures(title),
    isBulk: isBulkRoll(title),
    lastCheckedAt: new Date(),
  };
}

export const grainationAdapter: StoreAdapter = {
  storeId: "grainanation",
  storeName: "Graination",
  baseUrl: "https://graination.ca",

  async fetchCandidatesForFilm(film: FilmSeed) {
    const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`} 35mm`;
    const searchUrl = buildSearchUrl(this.baseUrl, q);
    const html = await fetchText(searchUrl);
    const productUrls = extractProductLinks(this.baseUrl, html).slice(0, 10);

    const candidates: ListingCandidate[] = [];
    for (const u of productUrls) {
      const c = await fetchCandidateFromProductPage(u).catch(() => null);
      if (!c) continue;

      const t = c.titleRaw.toLowerCase();
      const matches = film.aliases.some((a) =>
        a
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
          .every((tok) => tok.length < 3 || t.includes(tok))
      );
      if (!matches) continue;

      candidates.push(c);
    }

    return candidates;
  },
};

