import type { StoreAdapter } from "./types.js";
import type { FilmSeed } from "../catalog/films.js";
import {
  extractJsonLd,
  extractProductLinksFromHtml,
  fetchText,
  isBulkRoll,
  looksLike35mm,
  parseExposures,
  parseMoneyToCents,
  parsePackSize,
} from "./shared.js";

function pickBestQuery(film: FilmSeed) {
  // Bias toward 35mm tokens to reduce non-film products in results.
  const primary = film.aliases[0] ?? `${film.brand} ${film.name}`;
  return `${primary} 35mm`;
}

function parseFromJsonLd(html: string) {
  const blocks = extractJsonLd(html);

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as any;
    if (anyB["@type"] !== "Product") continue;

    const titleRaw = typeof anyB.name === "string" ? anyB.name : null;
    const offers = anyB.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (!offer || typeof offer !== "object") continue;

    const currency = offer.priceCurrency;
    const price = offer.price;
    const availability = offer.availability;

    if (currency && currency !== "CAD") continue;
    if (!titleRaw || !looksLike35mm(titleRaw)) continue;

    const priceCadCents =
      typeof price === "number"
        ? Math.round(price * 100)
        : typeof price === "string"
          ? parseMoneyToCents(price)
          : null;
    if (priceCadCents == null) continue;

    const inStock =
      typeof availability === "string"
        ? availability.toLowerCase().includes("instock")
        : true;

    return {
      titleRaw,
      priceCadCents,
      inStock,
      packSize: parsePackSize(titleRaw),
      exposures: parseExposures(titleRaw),
      isBulk: isBulkRoll(titleRaw),
    };
  }

  return null;
}

function parseFromText(html: string) {
  // Fallback parser for Shopify-ish pages: look for "Price" then "$X.XX", and "Stock: In stock".
  const priceMatch = html.match(/Price:\s*<\/[^>]+>\s*([\s\S]{0,200}?)\$/i) ?? html.match(/\$([0-9][0-9.,]*)/);
  const dollarMatch = html.match(/\$([0-9][0-9.,]*)/);
  const stockMatch = html.match(/Stock:\s*<\/[^>]+>\s*([\s\S]{0,80})/i) ?? html.match(/\b(in stock|out of stock|sold out)\b/i);
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const titleRaw = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;
  if (!titleRaw || !looksLike35mm(titleRaw)) return null;

  const priceCadCents = dollarMatch?.[1] ? parseMoneyToCents(dollarMatch[1]) : null;
  if (priceCadCents == null) return null;

  const stockText = stockMatch?.[1]?.toString().toLowerCase() ?? "";
  const inStock = stockText.includes("in stock") && !stockText.includes("out of stock") && !stockText.includes("sold out");

  return {
    titleRaw,
    priceCadCents,
    inStock,
    packSize: parsePackSize(titleRaw),
    exposures: parseExposures(titleRaw),
    isBulk: isBulkRoll(titleRaw),
  };
}

async function parseProductPage(url: string) {
  const html = await fetchText(url);
  const fromLd = parseFromJsonLd(html);
  if (fromLd) return fromLd;
  return parseFromText(html);
}

export const theCameraStoreAdapter: StoreAdapter = {
  storeId: "the-camera-store",
  storeName: "The Camera Store",
  baseUrl: "https://thecamerastore.com",

  async fetchCandidatesForFilm(film) {
    const query = pickBestQuery(film);
    const searchUrl = new URL("/search", this.baseUrl);
    searchUrl.searchParams.set("q", query);

    const searchHtml = await fetchText(searchUrl.toString());
    const productUrls = extractProductLinksFromHtml(this.baseUrl, searchHtml);

    const candidates = [];
    const seen = new Set<string>();

    // Cap per film to keep runs fast/polite.
    for (const url of productUrls.slice(0, 20)) {
      if (seen.has(url)) continue;
      seen.add(url);

      const parsed = await parseProductPage(url).catch(() => null);
      if (!parsed) continue;

      // Basic relevance check: must include one alias token set.
      const titleLower = parsed.titleRaw.toLowerCase();
      const matchesAlias = film.aliases.some((a) => {
        const aNorm = a.toLowerCase();
        return aNorm.split(/\s+/).every((tok) => tok.length >= 3 ? titleLower.includes(tok) : true);
      });
      if (!matchesAlias) continue;

      candidates.push({
        url,
        titleRaw: parsed.titleRaw,
        priceCadCents: parsed.priceCadCents,
        currency: "CAD" as const,
        inStock: parsed.inStock,
        packSize: parsed.packSize,
        exposures: parsed.exposures,
        isBulk: parsed.isBulk,
        lastCheckedAt: new Date(),
      });
    }

    return candidates;
  },
};

