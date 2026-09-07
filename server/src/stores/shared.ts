export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchText(url: string) {
  let attempt = 0;
  let backoffMs = 750;

  // Be polite: small delay between requests.
  await sleep(250);

  while (true) {
    attempt += 1;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "user-agent": "FilmTracker/0.1 (+https://localhost) - price tracker",
          accept: "text/html,application/xhtml+xml",
        },
      },
      20000
    );

    if (res.ok) return await res.text();

    if (res.status === 429 && attempt <= 4) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : NaN;
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(1000, Math.round(retryAfterSeconds * 1000))
        : backoffMs;
      await sleep(waitMs);
      backoffMs = Math.min(8000, backoffMs * 2);
      continue;
    }

    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
}

export function extractProductLinksFromHtml(baseUrl: string, html: string) {
  const links = new Set<string>();
  const re = /href="(\/products\/[^"?]+)(?:\?[^"]*)?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1];
    if (!path) continue;
    links.add(new URL(path, baseUrl).toString());
  }
  return [...links];
}

export function extractJsonLd(html: string) {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  }
  return blocks;
}

export function parseMoneyToCents(value: string) {
  // Handles "$30.87", "30.87", "30", "1,234.56"
  const cleaned = value.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

/**
 * Numbers in a title that describe packaging rather than film speed: roll lengths,
 * exposure counts, pack sizes, format codes. Removing them before matching stops an
 * ISO token from matching one of them — "Delta 400 … 100ft roll" must not satisfy
 * the alias "delta 100", and "Kentmere 400 … 100' Bulk" must not satisfy
 * "kentmere 100".
 */
function stripPackagingNumbers(s: string) {
  return s
    .replace(/\b\d+\s*(?:ft|feet|foot|pieds?)\b/g, " ") // 100ft / 100 feet / 100 pieds
    .replace(/\b\d+\s*['’′]/g, " ") //             100' / 100’ / 100′
    // Shopify returns some titles with the prime still HTML-encoded, e.g.
    // "Ultrapan 400 35mm 100&#8242; Bulk Roll", which otherwise leaves a bare 100.
    .replace(/\b\d+\s*&#\d+;/g, " ")
    .replace(/\b\d+\s*m(?:et(?:er|re)s?)?\b/g, " ") // 30m
    .replace(/\b\d+\s*exp(?:osures?)?\b/g, " ") //  36exp / 24 exposures
    .replace(/\b135\s*[-–]\s*\d+/g, " ") //         135-36
    .replace(/\b\d+\s*(?:rolls?|packs?|pk|pak)\b/g, " ") // 3 rolls / 5 pack
    .replace(/\b\d+\s*sheets?\b/g, " ");
}

/**
 * True when `title` matches any of the film's aliases. An alias matches when every
 * one of its tokens is present; tokens shorter than 3 chars are ignored so they
 * don't match incidental substrings.
 *
 * Word tokens match as substrings ("colorplus" matches "ColorPlus 200"), but purely
 * numeric tokens — ISO speeds — must match on a word boundary against a title with
 * packaging numbers stripped. Substring matching on ISO silently mis-assigns whole
 * films: it priced Kentmere PAN 100/200 as PAN 400 at four stores.
 */
export function matchesFilmAliases(title: string, aliases: string[]) {
  const lower = title.toLowerCase();
  const forNumbers = stripPackagingNumbers(lower);

  return aliases.some((alias) =>
    alias
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((tok) => {
        // Numeric tokens are checked before the short-token rule: an ISO of "50" is
        // only two characters, and skipping it turns "cinestill 50" into a match on
        // every CineStill product.
        if (/^\d+$/.test(tok)) return new RegExp(`\\b${tok}\\b`).test(forNumbers);
        if (tok.length < 3) return true;
        // Plain word tokens match on a boundary too, so a short one can't hide inside
        // a longer word — "harman red" was matching every Harman listing marked
        // "Expired". Tokens carrying punctuation ("hp5+", "fp4+") keep substring
        // matching, since a trailing symbol has no word boundary after it.
        if (/^[a-z0-9]+$/.test(tok)) return new RegExp(`\\b${tok}\\b`).test(lower);
        return lower.includes(tok);
      })
  );
}

export function looksLike35mm(title: string) {
  const t = title.toLowerCase();
  const has35 = /\b35\s*mm\b/.test(t) || /\b135\b/.test(t) || /\b135-36\b/.test(t);
  // Keep bulk rolls in-scope (they are still 35mm film); exclude non-35mm formats.
  const excludes = /\b120\b/.test(t) || /\b4x5\b/.test(t) || /\b8x10\b/.test(t);
  return has35 && !excludes;
}

export function parsePackSize(title: string) {
  const t = title.toLowerCase();

  // "3 pack", "3-pack", "3pack", "3pk", "3 pk"
  const pack = t.match(/\b(\d{1,2})\s*[-–]?\s*(?:packs?|pks?)\b/);
  if (pack?.[1]) {
    const n = Number(pack[1]);
    if (n >= 1 && n <= 12) return n;
  }

  // "3 rolls", "5 Rolls Pack". Digits must sit directly against the word, so bulk
  // lengths written "100ft roll" or "100' roll" are not read as a pack of 100.
  const rolls = t.match(/\b(\d{1,2})\s*rolls\b/);
  if (rolls?.[1]) {
    const n = Number(rolls[1]);
    if (n >= 2 && n <= 12) return n;
  }

  // French word order puts the count after the noun: "Pack 3", "paquet de 5".
  const frPack = t.match(/\b(?:pack|paquet)\s*(?:de\s*)?(\d{1,2})\b/);
  if (frPack?.[1]) {
    const n = Number(frPack[1]);
    if (n >= 2 && n <= 12) return n;
  }

  // Kodak sells a "ProPack" of 5.
  if (/\bpro\s*pack\b/.test(t)) {
    const n = t.match(/\bpro\s*pack[^0-9]{0,12}(\d{1,2})\b/)?.[1];
    return n && Number(n) <= 12 ? Number(n) : 5;
  }

  return null;
}

export function parseExposures(title: string): 24 | 36 | null {
  const t = title.toLowerCase();
  // Common formats: "36 exp", "36exp", "36 exposures", "135-36", "135-36exp"
  if (/\b24\b/.test(t) && /\bexp(?:osure)?s?\b/.test(t)) return 24;
  if (/\b36\b/.test(t) && /\bexp(?:osure)?s?\b/.test(t)) return 36;

  // 135-24 / 135-36 possibly followed by "exp"
  if (/\b135\s*-\s*24(?=\D|$)/.test(t)) return 24;
  if (/\b135\s*-\s*36(?=\D|$)/.test(t)) return 36;

  // 24exp / 36exp without a space
  if (/\b24\s*exp\b/.test(t) || /\b24exp\b/.test(t)) return 24;
  if (/\b36\s*exp\b/.test(t) || /\b36exp\b/.test(t)) return 36;

  // French: "36 poses"
  if (/\b24\s*poses?\b/.test(t)) return 24;
  if (/\b36\s*poses?\b/.test(t)) return 36;

  // e.g. "35mm 36" without "exp"
  if (/\b35\s*mm\b/.test(t) && /\b24\b/.test(t) && !/\b120\b/.test(t)) return 24;
  if (/\b35\s*mm\b/.test(t) && /\b36\b/.test(t) && !/\b120\b/.test(t)) return 36;

  return null;
}

/**
 * Detect expired stock and the date the store gives for it.
 *
 * Four shapes occur in the wild:
 *   "[Expired 01/2025] CineStill 50D …"      -> 01/2025
 *   "[Expired 08/23] Kodak T-Max 3200 …"     -> 08/23
 *   "Harman Phoenix 200 … - Expired May 2026" -> May 2026
 *   "Fomapan 100 Classic … (expired)"         -> null
 *
 * Expired film is genuinely cheap, so it must not be silently mixed into the
 * lowest-price display: flag it, then exclude it from headline prices.
 */
export function parseExpiry(title: string): { isExpired: boolean; expiryLabel: string | null } {
  // "Short dated" is near-expiry stock sold at the same kind of discount, so it is
  // treated the same way: kept out of headline prices, surfaced as a deal.
  if (/\bshort[\s-]?dated\b/i.test(title)) return { isExpired: true, expiryLabel: "short dated" };

  // "Exp 12/2026" is an expiry date, but "36exp" is an exposure count — so the short
  // form only counts when a date follows it.
  const shortForm = title.match(/\bexp\.?\s*:?\s*(\d{1,2}\s*\/\s*\d{2,4})/i)?.[1];
  if (shortForm) return { isExpired: true, expiryLabel: shortForm.replace(/\s+/g, "") };

  if (!/\bexpir|\bp[eé]rim/i.test(title)) return { isExpired: false, expiryLabel: null };

  const label =
    // \S* rather than an alternation so "Expired", "Expiré" and "Expirée" all work.
    title.match(/\bexpir\S*\s*:?\s*(\d{1,2}\s*\/\s*\d{2,4})/i)?.[1] ??
    title.match(
      /\bexpir\S*\s*:?\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4})/i
    )?.[1] ??
    title.match(/\bexpir\S*\s*:?\s*(\d{4})\b/i)?.[1] ??
    null;

  return { isExpired: true, expiryLabel: label ? label.replace(/\s+/g, " ").trim() : null };
}

export function isBulkRoll(title: string) {
  const t = title.toLowerCase();
  return (
    /\bbulk\b/.test(t) ||
    // French: "100 pieds"
    /\b\d+\s*pieds?\b/.test(t) ||
    /\b100'\b/.test(t) ||
    /100\s*(?:ft|feet)\b/.test(t) ||
    /\b100ft\b/.test(t) ||
    /\b30m\b/.test(t)
  );
}


/** Non-film products that sit in film categories and carry film-ish tags. */
export const ACCESSORY_RX =
  /\b(adapter|adaptor|holder|reel|tank|squeegee|changing bag|clips?|cassette|loader|developer|fixer|toner|stop bath|chemistry|scanner|album|sleeve|binder|frame|camera|disposable|single[- ]use|loupe|backpack|kit|filter|enlarger|easel|thermometer|funnel|graduate|apron|gloves)\b/i;
