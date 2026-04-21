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
  // Typical WooCommerce search results: <a href=".../product/...">
  const re = /href=\"(https?:\/\/www\.beauphoto\.com\/product\/[^\"?#]+\/)\"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    links.add(new URL(m[1], baseUrl).toString());
  }
  return [...links];
}

function parseVariationsAttribute(html: string) {
  const m = html.match(/data-product_variations=\"([^\"]+)\"/i);
  if (!m?.[1]) return null;

  const raw = m[1]
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");

  try {
    const variations = JSON.parse(raw);
    return Array.isArray(variations) ? variations : null;
  } catch {
    return null;
  }
}

function pick35mmVariation(variations: any[]) {
  for (const v of variations) {
    const attrs = v?.attributes ?? {};
    const fmt = attrs["attribute_pa_film-format"] ?? attrs["attribute_film-format"] ?? attrs["attribute_pa_format"];
    if (typeof fmt === "string" && fmt.toLowerCase().includes("35mm")) return v;
  }
  return null;
}

function extract35mmOptionLabel(html: string) {
  // Looks like: <option value="35mm - 36 exp.">35mm - 36 exp.</option>
  const m = html.match(/<option[^>]*value=\"([^\">]*35mm[^\">]*)\"[^>]*>[^<]*<\/option>/i);
  return m?.[1]?.trim() ?? null;
}

async function fetchCandidateFromProductPage(url: string): Promise<ListingCandidate | null> {
  const html = await fetchText(url);

  // Title: h1.product_title
  const titleMatch = html.match(/<h1[^>]*class=\"[^\"]*product_title[^\"]*\"[^>]*>([\s\S]*?)<\/h1>/i);
  const titleRaw = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;
  if (!titleRaw) return null;

  // Variation data contains price + in-stock.
  const variations = parseVariationsAttribute(html);
  if (!variations) return null;

  const v35 = pick35mmVariation(variations);
  if (!v35) return null;

  const displayPrice = v35.display_price;
  const inStock = Boolean(v35.is_in_stock);
  const priceCadCents =
    typeof displayPrice === "number" ? Math.round(displayPrice * 100) : parseMoneyToCents(String(displayPrice));
  if (priceCadCents == null) return null;

  const optionLabel = extract35mmOptionLabel(html) ?? titleRaw;

  // Some products may not be film or may include other formats.
  if (!looksLike35mm(optionLabel) && !looksLike35mm(titleRaw)) return null;

  return {
    url,
    titleRaw: `${titleRaw} (${optionLabel})`,
    priceCadCents,
    currency: "CAD",
    inStock,
    packSize: parsePackSize(optionLabel) ?? parsePackSize(titleRaw),
    exposures: parseExposures(optionLabel) ?? parseExposures(titleRaw),
    isBulk: isBulkRoll(optionLabel) || isBulkRoll(titleRaw),
    lastCheckedAt: new Date(),
  };
}

export const beauPhotoAdapter: StoreAdapter = {
  storeId: "beau-photo",
  storeName: "Beau Photo",
  baseUrl: "https://www.beauphoto.com",

  async fetchCandidatesForFilm(film: FilmSeed) {
    const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`} 35mm`;
    const searchUrl = buildSearchUrl(this.baseUrl, q);
    const searchHtml = await fetchText(searchUrl);
    const productUrls = extractProductLinks(this.baseUrl, searchHtml).slice(0, 10);

    const candidates: ListingCandidate[] = [];
    for (const u of productUrls) {
      const c = await fetchCandidateFromProductPage(u).catch(() => null);
      if (!c) continue;

      // relevance check
      const t = c.titleRaw.toLowerCase();
      const matches = film.aliases.some((a) => {
        const aNorm = a.toLowerCase();
        return aNorm.split(/\s+/).filter(Boolean).every((tok) => tok.length < 3 || t.includes(tok));
      });
      if (!matches) continue;

      candidates.push(c);
    }

    return candidates;
  },
};

