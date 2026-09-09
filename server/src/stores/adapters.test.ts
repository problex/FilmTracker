import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filmSeeds } from "../catalog/films.js";

/**
 * Adapters run against saved responses from the live stores.
 *
 * The point is that a scraper fails silently: a broken selector returns zero rows,
 * which is indistinguishable from "the store has no stock". These fixtures pin the
 * behaviour that mattered — format filtering, price units, pack sizes and expiry —
 * so a regression shows up as a failed assertion rather than a quiet gap in the data.
 *
 * Refresh with the curl commands in `__fixtures__/README.md` if a store changes shape.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "__fixtures__", name), "utf8");

/**
 * Only `fetchText` is stubbed; every parsing helper stays real.
 *
 * `vi.hoisted` is required: `vi.mock` is hoisted above normal declarations, so a
 * plain `const` defined here would not exist yet when the factory runs.
 */
const { fetchText } = vi.hoisted(() => ({
  fetchText: vi.fn<(url: string) => Promise<string>>(),
}));
vi.mock("./shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared.js")>();
  return { ...actual, fetchText };
});

const { createShopifyAdapter } = await import("./shopify.js");
const { createWooStoreApiAdapter } = await import("./wooStoreApi.js");
const { beauPhotoAdapter } = await import("./beauPhoto.js");
const { filmWarehouseAdapter } = await import("./filmWarehouse.js");

describe("Shopify bulk adapter", () => {
  // Each suite installs its own implementation; no global reset needed.
  beforeEach(() => {
    const catalog = fixture("shopify-popho.json");
    fetchText.mockImplementation(async (url) =>
      url.includes("page=1") ? catalog : JSON.stringify({ products: [] })
    );
  });

  it("keeps 35mm and drops other formats", async () => {
    const adapter = createShopifyAdapter({
      storeId: "popho",
      storeName: "Popho Camera",
      baseUrl: "https://popho.ca",
    });
    const byFilm = await adapter.fetchCandidatesForAllFilms!(filmSeeds);
    const all = [...byFilm.values()].flat();

    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.titleRaw, `${c.titleRaw} should not be 120`).not.toMatch(/\b120\b/);
    }
  });

  it("reads products.json prices as dollars, not cents", async () => {
    // products.json returns "16.99" while /products/<handle>.js returns 1699.
    // Reusing the latter's handling made every price 100x too low.
    const adapter = createShopifyAdapter({
      storeId: "popho",
      storeName: "Popho Camera",
      baseUrl: "https://popho.ca",
    });
    const byFilm = await adapter.fetchCandidatesForAllFilms!(filmSeeds);
    const all = [...byFilm.values()].flat();

    for (const c of all) {
      expect(c.priceCadCents, `${c.titleRaw} @ ${c.priceCadCents}`).toBeGreaterThan(300);
      expect(c.priceCadCents).toBeLessThan(100_000);
    }
  });

  it("assigns listings to the right film", async () => {
    const adapter = createShopifyAdapter({
      storeId: "popho",
      storeName: "Popho Camera",
      baseUrl: "https://popho.ca",
    });
    const byFilm = await adapter.fetchCandidatesForAllFilms!(filmSeeds);
    for (const [filmId, cs] of byFilm) {
      const film = filmSeeds.find((f) => f.id === filmId)!;
      for (const c of cs) {
        const { matchesFilmAliases } = await import("./shared.js");
        expect(matchesFilmAliases(c.titleRaw, film.aliases), `${c.titleRaw} -> ${filmId}`).toBe(true);
      }
    }
  });
});

describe("WooCommerce Store API adapter", () => {
  beforeEach(() => {
    const catalog = fixture("woo-filmwarehouse.json");
    fetchText.mockImplementation(async (url) =>
      url.includes("page=1") ? catalog : "[]"
    );
  });

  const build = () =>
    createWooStoreApiAdapter({
      storeId: "film-warehouse",
      storeName: "FilmWarehouse",
      baseUrl: "https://filmwarehouse.ca",
      // Mirrors filmWarehouse.ts: title wins, category only when the title is silent.
      is35mm: (p, title) =>
        !/\b(120|110|4\s?x\s?5|8\s?x\s?10)\b/i.test(title) &&
        (/\b(35\s?mm|135)\b/i.test(title) ||
          (p.categories ?? []).some((c) => c.name?.trim().toLowerCase() === "35mm")),
    });

  it("converts minor units to cents", async () => {
    const byFilm = await build().fetchCandidatesForAllFilms!(filmSeeds);
    const all = [...byFilm.values()].flat();
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) expect(c.priceCadCents).toBeGreaterThan(300);
  });

  it("excludes sheet and 120 film", async () => {
    const byFilm = await build().fetchCandidatesForAllFilms!(filmSeeds);
    const titles = [...byFilm.values()].flat().map((c) => c.titleRaw);
    expect(titles.some((t) => /4.5|sheets/i.test(t))).toBe(false);
    expect(titles.some((t) => /\b120\b/.test(t))).toBe(false);
  });

  it("records a short-dated multipack as both", async () => {
    const byFilm = await build().fetchCandidatesForAllFilms!(filmSeeds);
    const ultramax = byFilm.get("kodak-ultramax-400") ?? [];
    const shortDated = ultramax.find((c) => c.isExpired);

    expect(shortDated, "expected the 'Exp 12/2026' 3-pack").toBeDefined();
    expect(shortDated!.packSize).toBe(3);
    expect(shortDated!.expiryLabel).toBe("12/2026");
    expect(shortDated!.exposures).toBe(36);
  });

  /**
   * The shipped adapter, not a locally rebuilt one.
   *
   * Every other case in this file constructs its own adapter and passes no page
   * limit, so none of them touch the exported store configs. A bad `maxPages` there
   * is invisible to this suite: `params.maxPages ?? MAX_PAGES` keeps a 0 (it is not
   * nullish) and `for (page = 1; page <= 0)` never runs, so the store would fetch
   * nothing and report an empty catalogue as a clean scrape — listings to 0 with
   * errorCount 0, the silent-zero failure described in PLAN.md.
   */
  it("returns listings through the exported FilmWarehouse adapter", async () => {
    const byFilm = await filmWarehouseAdapter.fetchCandidatesForAllFilms!(filmSeeds);
    const all = [...byFilm.values()].flat();

    expect(all.length, "FilmWarehouse fetched an empty catalogue").toBeGreaterThan(0);
    expect(byFilm.get("kentmere-pan-100")?.map((c) => c.titleRaw)).toContain(
      "Kentmere Pan 100 35mm"
    );
    expect(byFilm.get("kentmere-pan-400")?.map((c) => c.titleRaw)).toContain(
      "Kentmere Pan 400 35mm"
    );
  });
});

describe("Beau Photo adapter", () => {
  beforeEach(() => {
    const catalog = fixture("woo-beauphoto.json");
    const variations = JSON.parse(fixture("woo-beauphoto-variations.json")) as Record<string, unknown>;
    fetchText.mockImplementation(async (url) => {
      const m = url.match(/\/products\/(\d+)$/);
      if (m) {
        const v = variations[m[1]!];
        if (!v) throw new Error(`no fixture for variation ${m[1]}`);
        return JSON.stringify(v);
      }
      return url.includes("page=1") ? catalog : "[]";
    });
  });

  it("prices each 35mm variation separately rather than using the parent range", async () => {
    const byFilm = await beauPhotoAdapter.fetchCandidatesForAllFilms!(filmSeeds);
    const hp5 = byFilm.get("ilford-hp5-400") ?? [];

    const roll = hp5.find((c) => !c.isBulk);
    const bulk = hp5.find((c) => c.isBulk);

    expect(roll, "expected a 36exp roll").toBeDefined();
    expect(bulk, "expected a 100ft bulk roll").toBeDefined();
    // The old adapter recorded the bulk price against the plain 35mm listing.
    expect(roll!.priceCadCents).toBeLessThan(bulk!.priceCadCents);
    expect(roll!.priceCadCents).toBe(1695);
    expect(bulk!.priceCadCents).toBe(19995);
  });

  it("flags the 100ft roll as bulk from the variation slug", async () => {
    // The label writes it "100′ roll" with a prime the title test does not catch.
    const byFilm = await beauPhotoAdapter.fetchCandidatesForAllFilms!(filmSeeds);
    const bulk = (byFilm.get("ilford-delta-400") ?? []).filter((c) => c.isBulk);
    expect(bulk.length).toBeGreaterThan(0);
  });

  it("gives every variation its own URL", async () => {
    // listings is unique on (store_id, url); shared URLs would collapse variations.
    const byFilm = await beauPhotoAdapter.fetchCandidatesForAllFilms!(filmSeeds);
    const urls = [...byFilm.values()].flat().map((c) => c.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("stripStoreSuffix", () => {
  it("removes the store name a Dakis page title appends", async () => {
    const { stripStoreSuffix } = await import("./dakisShop.js");
    // Punctuation differs from the seed name.
    expect(stripStoreSuffix("Kodak Gold 200 Film 135-24 exp - Don's Photo", "Dons Photo")).toBe(
      "Kodak Gold 200 Film 135-24 exp"
    );
    // The page may add a legal suffix the seed name does not carry.
    expect(
      stripStoreSuffix("Kentmere 400 ISO 135 B&W 36 exp. - DOWNTOWN CAMERA LIMITED", "DowntownCamera")
    ).toBe("Kentmere 400 ISO 135 B&W 36 exp.");
    // An unrelated trailing segment is left alone.
    expect(stripStoreSuffix("Ilford HP5 Plus - 35mm, 36 exp.", "Dons Photo")).toBe(
      "Ilford HP5 Plus - 35mm, 36 exp."
    );
  });
});
