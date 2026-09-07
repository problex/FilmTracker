import { describe, expect, it } from "vitest";
import {
  isBulkRoll,
  looksLike35mm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parsePackSize,
} from "./shared.js";

/**
 * Sténopé Lab (Montréal) writes its listings in French: "36 poses" for exposures,
 * "Pack 3" and "paquet de 5" with the count after the noun, "Expiré" for expiry, and
 * "rouleau 120" for medium format.
 */
describe("French listing titles", () => {
  it("reads exposures written as poses", () => {
    expect(parseExposures("Film couleur Fujifilm 200 (35mm, 36 poses)")).toBe(36);
    expect(parseExposures("Film noir et blanc Ilford HP5 (35mm, 24 poses)")).toBe(24);
  });
  it("reads pack sizes with the count after the noun", () => {
    expect(parsePackSize("Film couleur Kodak Eastman Gold 200 (Pack 3, 35mm, 36 poses)")).toBe(3);
    expect(parsePackSize("Film couleur Kodak Ektacolor 400 (35mm, 36 poses) paquet de 5")).toBe(5);
    expect(parsePackSize("Film couleur Kodak Gold (120 pack de 5)")).toBe(5);
  });
  it("reads French expiry", () => {
    expect(parseExpiry("Film couleur Kodak Ektar 100 (rouleau 120) (Expiré 09/2024)")).toEqual({
      isExpired: true, expiryLabel: "09/2024",
    });
    expect(parseExpiry("Film couleur Fujifilm 200 (35mm, 36 poses)").isExpired).toBe(false);
  });
  it("treats a roll length in pieds as bulk, not as an ISO", () => {
    // "100 pieds" is 100 feet; unstripped it made Ultrapan 400 also match Ultrapan 100.
    const t = "Film noir & blanc Film Flic ULTRAPAN 400 (100 pieds)";
    expect(isBulkRoll(t)).toBe(true);
    expect(matchesFilmAliases(t, ["ultrapan 100"])).toBe(false);
    expect(matchesFilmAliases(t, ["ultrapan 400"])).toBe(true);
  });

  it("still excludes 120 sold as 'rouleau 120'", () => {
    expect(looksLike35mm("Film couleur Kodak Ektacolor 400 (120, rouleau)")).toBe(false);
    expect(looksLike35mm("Film couleur Fujifilm 200 (35mm, 36 poses)")).toBe(true);
  });
});
