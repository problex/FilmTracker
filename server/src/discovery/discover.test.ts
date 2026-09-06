import { describe, expect, it } from "vitest";
import { looksLikeFilmRoll } from "./discover.js";

/**
 * Discovery has no alias filter by definition, so it sees every 35mm-ish product a
 * store sells. Stores sell far more 35mm *lenses* than 35mm film: without this filter
 * the report was 349 rows, mostly lenses, developing services and film holders.
 */
describe("looksLikeFilmRoll", () => {
  it("keeps real film, however the store writes it", () => {
    const keep = [
      "Adox HR-50 - 135 - 36ex",
      "Adox CHS 100 II | 35mm - 36 Exposures",
      "AgfaPhoto APX 400 Professional Black and White Negative Film (35mm Roll Film, 36 Exposures)",
      "Rollei RPX 25 — Film Format: 35mm – 36 exp.",
      "Fantôme Kino B&W 35 mm ISO 8",
      "Flic Film - Kodak Vision3 250D | 35mm - 36 Exposures",
      "Ultrafine Xtreme 100 36exp 35mm",
    ];
    for (const t of keep) expect(looksLikeFilmRoll(t), t).toBe(true);
  });

  it("drops lenses, which is where the noise came from", () => {
    const drop = [
      "7Artisans 35mm f1.2 - Nikon Z",
      "7Artisans AF 35mm f1.8 - Sony E",
      "Canon RF 15-35mm f2.8L IS USM",
      "Canon CN-E 35mm T1.5 L F Cine Lens (EF Mount)",
      "Canon EW-88F Lens Hood for RF 15-35mm f2.8L IS USM",
    ];
    for (const t of drop) expect(looksLikeFilmRoll(t), t).toBe(false);
  });

  it("drops services and darkroom supplies that mention film", () => {
    const drop = [
      "35mm Film Developing",
      "35mm Film Holders",
      "35mm Film Canister Opener",
      "AP Photo NTR 351110 Reloadable 35mm Film Cassette",
      "AP Plastic 35mm Film Cassette with Spool",
    ];
    for (const t of drop) expect(looksLikeFilmRoll(t), t).toBe(false);
  });
});
