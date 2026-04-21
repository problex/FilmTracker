import type { FilmSeed } from "../catalog/films.js";
import type { ListingCandidate, StoreAdapter } from "./types.js";
import { fetchText, isBulkRoll, looksLike35mm, parseExposures, parsePackSize } from "./shared.js";

type ShopifyProductJs = {
  title: string;
  handle: string;
  variants: {
    id: number;
    title: string;
    available: boolean;
    price: number; // cents
  }[];
};

function extractProductHandlesFromHtml(html: string) {
  const handles = new Set<string>();

  // Links like /products/<handle>
  const re = /href=\"\/products\/([a-z0-9][a-z0-9-]+)(?:\?[^"]*)?\"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) handles.add(m[1]);
  }
  return [...handles];
}

async function fetchProductJson(baseUrl: string, handle: string): Promise<ShopifyProductJs | null> {
  const url = new URL(`/products/${handle}.js`, baseUrl).toString();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "FilmTracker/0.1 (+https://localhost) - price tracker",
        accept: "application/json,text/javascript,*/*",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
  if (!res.ok) return null;
  return (await res.json()) as ShopifyProductJs;
}

function chooseBest35mmVariant(p: ShopifyProductJs) {
  // Choose the cheapest available variant that looks like 35mm.
  const candidates = p.variants
    .filter((v) => v && typeof v.title === "string")
    .filter((v) => looksLike35mm(`${p.title} ${v.title}`))
    .sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

export function createShopifyAdapter(params: {
  storeId: string;
  storeName: string;
  baseUrl: string;
  // Optional: a fixed collection/search path for film
  searchPath?: string;
}): StoreAdapter {
  const { storeId, storeName, baseUrl } = params;
  const searchPath = params.searchPath ?? "/search";

  return {
    storeId,
    storeName,
    baseUrl,

    async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
      const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`} 35mm`;
      const u = new URL(searchPath, baseUrl);
      u.searchParams.set("q", q);

      const html = await fetchText(u.toString());
      const handles = extractProductHandlesFromHtml(html).slice(0, 20);

      const out: ListingCandidate[] = [];
      for (const handle of handles) {
        const p = await fetchProductJson(baseUrl, handle).catch(() => null);
        if (!p) continue;

        const variant = chooseBest35mmVariant(p);
        if (!variant) continue;

        const variantPart = variant.title && variant.title.toLowerCase() !== "default title" ? ` — ${variant.title}` : "";
        const titleRaw = `${p.title}${variantPart}`;
        const lower = titleRaw.toLowerCase();
        const matches = film.aliases.some((a) => {
          const aNorm = a.toLowerCase();
          return aNorm.split(/\s+/).filter(Boolean).every((tok) => tok.length < 3 || lower.includes(tok));
        });
        if (!matches) continue;

        const url = new URL(`/products/${handle}`, baseUrl);
        url.searchParams.set("variant", String(variant.id));

        out.push({
          url: url.toString(),
          titleRaw,
          priceCadCents: variant.price,
          currency: "CAD",
          inStock: variant.available,
          packSize: parsePackSize(`${p.title} ${variant.title}`),
          exposures: parseExposures(`${p.title} ${variant.title}`),
          isBulk: isBulkRoll(`${p.title} ${variant.title}`),
          lastCheckedAt: new Date(),
        });
      }

      return out;
    },
  };
}

