import { describe, expect, it } from "vitest";
import {
  isBulkRoll,
  looksLike35mm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parseMoneyToCents,
  parsePackSize,
} from "./shared.js";
import { filmSeeds } from "../catalog/films.js";

/**
 * Every case below is a real listing title from a Canadian store, and most encode a
 * bug that reached production. Scrapers fail silently — a broken matcher returns
 * plausible-looking rows rather than an error — so these are the guard rail.
 */

const aliasesFor = (id: string) => {
  const film = filmSeeds.find((f) => f.id === id);
  if (!film) throw new Error(`no such film: ${id}`);
  return film.aliases;
};

describe("matchesFilmAliases", () => {
  it("matches the film it names", () => {
    expect(matchesFilmAliases("Kodak Portra 400 - 35mm, 36exp.", aliasesFor("kodak-portra-400"))).toBe(true);
    expect(matchesFilmAliases("ILFORD HP5 plus 35mm 36exp", aliasesFor("ilford-hp5-400"))).toBe(true);
  });

  it("does not read an ISO out of a roll length", () => {
    // "delta 100" once matched this, because 100 occurs inside "100ft".
    const title = "Ilford Delta 400 | 35mm | 100ft roll";
    expect(matchesFilmAliases(title, aliasesFor("ilford-delta-100"))).toBe(false);
    expect(matchesFilmAliases(title, aliasesFor("ilford-delta-400"))).toBe(true);
  });

  it("does not read an ISO out of a bulk roll marked 100'", () => {
    const title = "Kentmere 400 Pan 35mm - 100' Bulk Film";
    expect(matchesFilmAliases(title, aliasesFor("kentmere-pan-100"))).toBe(false);
    expect(matchesFilmAliases(title, aliasesFor("kentmere-pan-400"))).toBe(true);
  });

  it("keeps Kentmere PAN 100/200/400 apart", () => {
    // PAN 100 and 200 were both being priced as PAN 400 at four stores.
    expect(matchesFilmAliases("Kentmere Pan 100, 35mm, 36exp.", aliasesFor("kentmere-pan-400"))).toBe(false);
    expect(matchesFilmAliases("Kentmere Pan 200 - 135-36", aliasesFor("kentmere-pan-400"))).toBe(false);
    expect(matchesFilmAliases("Kentmere Pan 100, 35mm, 36exp.", aliasesFor("kentmere-pan-100"))).toBe(true);
    expect(matchesFilmAliases("Kentmere Pan 200 - 135-36", aliasesFor("kentmere-pan-200"))).toBe(true);
  });

  it("honours a two-digit ISO", () => {
    // "50" is two characters, and the short-token rule used to skip it entirely, so
    // "cinestill 50" matched every CineStill product.
    const t800 = "CineStill 800T High Speed Color Negative Film, 35mm, 36exp.";
    expect(matchesFilmAliases(t800, aliasesFor("cinestill-50d"))).toBe(false);
    expect(matchesFilmAliases(t800, aliasesFor("cinestill-800t"))).toBe(true);
    expect(matchesFilmAliases("Cinestill 50 Daylight", aliasesFor("cinestill-50d"))).toBe(true);
  });

  it("does not match a short word hiding inside a longer one", () => {
    // "harman red" matched every Harman listing marked "Expi-RED".
    const expired = "[Expired 03/2026] Harman Phoenix 200 Color Negative Film,35mm, 36exp.";
    expect(matchesFilmAliases(expired, aliasesFor("harman-red-125"))).toBe(false);
    expect(matchesFilmAliases(expired, aliasesFor("harman-phoenix-200"))).toBe(true);
    expect(matchesFilmAliases("Harman RED - 135 C41 - 125iso - 36ex", aliasesFor("harman-red-125"))).toBe(true);
  });

  it("does not match 'analog' inside 'analogue'", () => {
    expect(
      matchesFilmAliases("Lomography Analogue Pocket Trio 110", aliasesFor("lomography-analog-trio"))
    ).toBe(false);
    expect(
      matchesFilmAliases(
        "NEW Lomography Analog Trio (metropolis-purple-SunKissed) | 135-36",
        aliasesFor("lomography-analog-trio")
      )
    ).toBe(true);
  });

  it("assigns every catalogue film at most one match per title", () => {
    const titles = [
      "Kodak Portra 400 - 35mm, 36exp.",
      "Ilford Delta 400 | 35mm | 100ft roll",
      "CineStill 800T High Speed Color Negative Film, 35mm, 36exp.",
      "Kentmere Pan 100, 35mm, 36exp.",
      "Harman Phoenix 200 - 35mm - 36ex - Expired May 2026",
      "Flic Film Aurora 400 35mm 36exp",
      "Aurora 42\" White Umbrella",
    ];
    for (const t of titles) {
      const hits = filmSeeds.filter((f) => matchesFilmAliases(t, f.aliases));
      expect(hits.length, `${t} -> ${hits.map((h) => h.id).join(" + ")}`).toBeLessThanOrEqual(1);
    }
  });

  it("does not match a film name hiding inside another word", () => {
    // These stores sell many "Diffusion" products, and "fusion" sits inside it.
    const fusion = aliasesFor("flic-fusion-200");
    expect(matchesFilmAliases("Fusion 200", fusion)).toBe(true);
    expect(matchesFilmAliases("Flic Film - Fusion 200 36ex C41", fusion)).toBe(true);
    expect(matchesFilmAliases("LEE Filters – White Diffusion #216", fusion)).toBe(false);
    expect(matchesFilmAliases("Photoflex Umbrella Diffusion Cover 45\u201d", fusion)).toBe(false);
    expect(matchesFilmAliases("Rosco Diffusion Filter Kit", fusion)).toBe(false);
  });

  it("does not match camera accessories that share a brand word", () => {
    // The Camera Store sells "Aurora" umbrellas and reflectors.
    expect(matchesFilmAliases('Aurora 42" White Umbrella', aliasesFor("flic-aurora-400"))).toBe(false);
    expect(matchesFilmAliases("Flic Film Aurora 400 35mm 36exp", aliasesFor("flic-aurora-400"))).toBe(true);
  });
});

describe("parsePackSize", () => {
  it("reads the formats stores actually use", () => {
    expect(parsePackSize("Kodak Gold 200 24exp 3 pack")).toBe(3);
    expect(parsePackSize("Fujifilm 200 Color Negative 35mm Roll Film (36 Exposures) (3-Pack)")).toBe(3);
    expect(parsePackSize("Ultramax 400 36exp 3pk - Exp 12/2026")).toBe(3);
    expect(parsePackSize("Kodak Ultramax 400, 3 Rolls Pack, 35mm, 36 exp.")).toBe(3);
    expect(parsePackSize("Kodak Portra 160 Color Print Film - 135-36exp ProPack (5 Rolls)")).toBe(5);
  });

  it("does not read a bulk roll length as a pack size", () => {
    expect(parsePackSize("Ilford HP5 Plus 400 - 35mm - 100ft roll")).toBeNull();
    expect(parsePackSize("Kentmere 400 Pan 35mm - 100' Bulk Film")).toBeNull();
  });

  it("returns null for a single roll", () => {
    expect(parsePackSize("Kodak Gold 200 - 35mm, 36 exp.")).toBeNull();
  });
});

describe("parseExpiry", () => {
  it("reads every label stores use", () => {
    expect(parseExpiry("[Expired 01/2025] CineStill 50D …")).toEqual({
      isExpired: true,
      expiryLabel: "01/2025",
    });
    expect(parseExpiry("[Expired 08/23] Kodak T-Max 3200 - 35mm, 36exp.")).toEqual({
      isExpired: true,
      expiryLabel: "08/23",
    });
    expect(parseExpiry("Harman Phoenix 200 - 35mm - 36ex - Expired May 2026")).toEqual({
      isExpired: true,
      expiryLabel: "May 2026",
    });
    expect(parseExpiry("Ultramax 400 36exp 3pk - Exp 12/2026")).toEqual({
      isExpired: true,
      expiryLabel: "12/2026",
    });
    expect(parseExpiry("Kodak ColorPlus 200 36exp - Short Dated")).toEqual({
      isExpired: true,
      expiryLabel: "short dated",
    });
  });

  it("does not read an exposure count as an expiry date", () => {
    // "36exp" must not trigger the short "Exp" form, which needs a date after it.
    expect(parseExpiry("Kodak Gold 200 36exp")).toEqual({ isExpired: false, expiryLabel: null });
    expect(parseExpiry("ILFORD HP5 plus 35mm 36exp")).toEqual({ isExpired: false, expiryLabel: null });
  });
});

describe("looksLike35mm", () => {
  it("accepts 35mm and 135, including bulk rolls", () => {
    expect(looksLike35mm("Kodak Gold 200 - 35mm, 36 exp.")).toBe(true);
    expect(looksLike35mm("Kodak Ultramax 400 135-36")).toBe(true);
    expect(looksLike35mm("Ilford HP5 Plus 400 - 35mm - 100ft roll")).toBe(true);
  });

  it("rejects other formats", () => {
    expect(looksLike35mm("CineStill 800T High Speed Color Negative Film, 120")).toBe(false);
    expect(looksLike35mm("Ilford Delta 100 4x5 (25 Sheets)")).toBe(false);
  });
});

describe("parseExposures / parseMoneyToCents / isBulkRoll", () => {
  it("parses exposures", () => {
    expect(parseExposures("Kodak Gold 200 - 35mm, 24 exp.")).toBe(24);
    expect(parseExposures("Kodak Ultramax 400 135-36")).toBe(36);
  });

  it("parses money to cents", () => {
    expect(parseMoneyToCents("$16.99")).toBe(1699);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
  });

  it("detects bulk rolls", () => {
    expect(isBulkRoll("Ilford HP5 Plus 400 - 35mm - 100ft roll")).toBe(true);
    expect(isBulkRoll("Kodak Gold 200 - 35mm, 36 exp.")).toBe(false);
  });
});
