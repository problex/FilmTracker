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

export function looksLike35mm(title: string) {
  const t = title.toLowerCase();
  const has35 = /\b35\s*mm\b/.test(t) || /\b135\b/.test(t) || /\b135-36\b/.test(t);
  // Keep bulk rolls in-scope (they are still 35mm film); exclude non-35mm formats.
  const excludes = /\b120\b/.test(t) || /\b4x5\b/.test(t) || /\b8x10\b/.test(t);
  return has35 && !excludes;
}

export function parsePackSize(title: string) {
  const t = title.toLowerCase();
  const m = t.match(/\b(\d)\s*[- ]?\s*pack\b/);
  if (m?.[1]) return Number(m[1]);
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

  // e.g. "35mm 36" without "exp"
  if (/\b35\s*mm\b/.test(t) && /\b24\b/.test(t) && !/\b120\b/.test(t)) return 24;
  if (/\b35\s*mm\b/.test(t) && /\b36\b/.test(t) && !/\b120\b/.test(t)) return 36;

  return null;
}

export function isBulkRoll(title: string) {
  const t = title.toLowerCase();
  return (
    /\bbulk\b/.test(t) ||
    /\b100'\b/.test(t) ||
    /100\s*(?:ft|feet)\b/.test(t) ||
    /\b100ft\b/.test(t) ||
    /\b30m\b/.test(t)
  );
}

