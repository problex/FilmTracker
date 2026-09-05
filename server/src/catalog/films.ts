export type FilmType = "color" | "bw";
export type FilmProcess = "c41" | "bw" | "e6";

export type FilmSeed = {
  id: string;
  brand: string;
  name: string;
  iso: number | null;
  type: FilmType;
  process: FilmProcess | null;
  aliases: string[];
  /**
   * Exposure count to assume when a listing's title doesn't state one. Only set it
   * for films sold in a single length — CineStill, for example, has no 24-exposure
   * roll — otherwise a guess would put a listing under the wrong variant filter.
   * Never applied to bulk rolls, which have no exposure count.
   */
  defaultExposures?: 24 | 36;
};

export const filmSeeds: FilmSeed[] = [
  {
    id: "kodak-portra-160",
    brand: "Kodak",
    name: "Portra 160",
    iso: 160,
    type: "color",
    process: "c41",
    aliases: ["portra 160", "kodak portra 160", "portra160"],
  },
  {
    id: "kodak-portra-400",
    brand: "Kodak",
    name: "Portra 400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["portra 400", "kodak portra 400", "portra400"],
  },
  {
    id: "kodak-portra-800",
    brand: "Kodak",
    name: "Portra 800",
    iso: 800,
    type: "color",
    process: "c41",
    aliases: ["portra 800", "kodak portra 800", "portra800"],
  },
  {
    id: "kodak-ektar-100",
    brand: "Kodak",
    name: "Ektar 100",
    iso: 100,
    type: "color",
    process: "c41",
    aliases: ["ektar 100", "kodak ektar 100", "ektar100", "ektar"],
  },
  {
    id: "kodak-colorplus-200",
    brand: "Kodak",
    name: "ColorPlus 200",
    iso: 200,
    type: "color",
    process: "c41",
    aliases: ["colorplus 200", "kodak colorplus 200", "color plus 200", "colorplus200", "colorplus"],
  },
  {
    id: "kodak-gold-200",
    brand: "Kodak",
    name: "Gold 200",
    iso: 200,
    type: "color",
    process: "c41",
    aliases: ["gold 200", "kodak gold 200", "kodak gold200"],
  },
  {
    id: "kodak-ultramax-400",
    brand: "Kodak",
    name: "Ultramax 400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["ultramax 400", "kodak ultramax 400", "ultramax400"],
  },
  {
    id: "kodak-ektacolor-160",
    brand: "Kodak",
    name: "Ektacolor 160",
    iso: 160,
    type: "color",
    process: "c41",
    aliases: [
      "ektacolor 160",
      "kodak ektacolor 160",
      "ektacolor160",
      "ektacolor pro 160",
      "kodak ektacolor pro 160",
    ],
  },
  {
    id: "kodak-ektacolor-400",
    brand: "Kodak",
    name: "Ektacolor 400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: [
      "ektacolor 400",
      "kodak ektacolor 400",
      "ektacolor400",
      "ektacolor pro 400",
      "kodak ektacolor pro 400",
    ],
  },
  {
    id: "kodak-ektacolor-800",
    brand: "Kodak",
    name: "Ektacolor 800",
    iso: 800,
    type: "color",
    process: "c41",
    aliases: [
      "ektacolor 800",
      "kodak ektacolor 800",
      "ektacolor800",
      "ektacolor pro 800",
      "kodak ektacolor pro 800",
    ],
  },
  {
    id: "kodak-tri-x-400",
    brand: "Kodak",
    name: "Tri-X 400",
    iso: 400,
    type: "bw",
    process: "bw",
    aliases: ["tri-x 400", "trix 400", "kodak tri-x", "kodak tri-x 400"],
  },
  {
    id: "kodak-t-max-100",
    brand: "Kodak",
    name: "T-MAX 100",
    iso: 100,
    type: "bw",
    process: "bw",
    aliases: ["t-max 100", "tmax 100", "kodak t-max 100", "kodak tmax 100", "tmax100"],
  },
  {
    id: "kodak-t-max-400",
    brand: "Kodak",
    name: "T-MAX 400",
    iso: 400,
    type: "bw",
    process: "bw",
    aliases: ["t-max 400", "tmax 400", "kodak t-max 400", "kodak tmax 400", "tmax400"],
  },
  {
    id: "ilford-hp5-400",
    brand: "Ilford",
    name: "HP5 Plus",
    iso: 400,
    type: "bw",
    process: "bw",
    aliases: ["hp5", "hp5+", "hp5 plus", "ilford hp5", "ilford hp5 plus"],
  },
  {
    id: "ilford-delta-400",
    brand: "Ilford",
    name: "Delta 400",
    iso: 400,
    type: "bw",
    process: "bw",
    aliases: ["delta 400", "ilford delta 400", "ilforddelta400"],
  },
  {
    id: "kentmere-pan-400",
    brand: "Kentmere",
    name: "PAN 400",
    iso: 400,
    type: "bw",
    process: "bw",
    // No bare "kentmere pan" alias: it matched Kentmere Pan 100 as well, so PAN 100
    // listings were being priced as PAN 400 at four stores. Every alias must pin the ISO.
    aliases: ["kentmere pan 400", "kentmere 400", "kentmere pan400", "pan 400 kentmere"],
  },

  // --- Phase 1 additions (stocked at all three surveyed Shopify stores) ---

  {
    id: "fujifilm-200",
    brand: "Fujifilm",
    name: "Fujicolor 200",
    iso: 200,
    type: "color",
    process: "c41",
    // "fujifilm 200" alone is too loose — it would match any Fujifilm product whose
    // title happens to contain 200. Every alias pins a Fuji colour-film word.
    aliases: ["fujicolor 200", "fujifilm color 200", "fujifilm colour 200", "fujifilm 200 color", "fuji c200"],
  },
  {
    id: "fujifilm-400",
    brand: "Fujifilm",
    name: "Fujicolor 400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["fujicolor 400", "fujifilm color 400", "fujifilm colour 400", "fujifilm 400 color"],
  },
  {
    id: "harman-phoenix-200",
    brand: "Harman",
    name: "Phoenix 200",
    iso: 200,
    type: "color",
    process: "c41",
    aliases: ["harman phoenix 200", "phoenix 200", "harman phoenix ii", "phoenix ii"],
  },
  {
    id: "kodak-ektachrome-e100",
    brand: "Kodak",
    name: "Ektachrome E100",
    iso: 100,
    type: "color",
    process: "e6",
    // No bare "kodak ektachrome": it also matched Super 8 Ektachrome 100D.
    aliases: ["ektachrome e100", "ektachrome 100", "ektachrome e6"],
  },
  {
    id: "fujifilm-velvia-100",
    brand: "Fujifilm",
    name: "Velvia 100",
    iso: 100,
    type: "color",
    process: "e6",
    aliases: ["velvia 100", "fujichrome velvia 100", "fujifilm velvia 100"],
  },
  {
    id: "cinestill-800t",
    brand: "CineStill",
    name: "800T",
    iso: 800,
    type: "color",
    process: "c41",
    aliases: ["cinestill 800t", "cinestill 800 tungsten", "800tungsten", "cinestill 800"],
    // CineStill is sold only as 36 exposures.
    defaultExposures: 36,
  },
  {
    id: "cinestill-400d",
    brand: "CineStill",
    name: "400D",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["cinestill 400d", "400dynamic", "cinestill 400 dynamic", "cinestill 400"],
    // CineStill is sold only as 36 exposures.
    defaultExposures: 36,
  },
  {
    id: "cinestill-50d",
    brand: "CineStill",
    name: "50D",
    iso: 50,
    type: "color",
    process: "c41",
    aliases: ["cinestill 50d", "50daylight", "cinestill 50 daylight", "cinestill 50"],
    // CineStill is sold only as 36 exposures.
    defaultExposures: 36,
  },
  {
    id: "ilford-fp4-125",
    brand: "Ilford",
    name: "FP4 Plus",
    iso: 125,
    type: "bw",
    process: "bw",
    aliases: ["ilford fp4", "fp4 plus", "fp4+", "fp4"],
  },
  {
    id: "ilford-delta-100",
    brand: "Ilford",
    name: "Delta 100",
    iso: 100,
    type: "bw",
    process: "bw",
    aliases: ["ilford delta 100", "delta 100"],
  },
  {
    id: "ilford-delta-3200",
    brand: "Ilford",
    name: "Delta 3200",
    iso: 3200,
    type: "bw",
    process: "bw",
    aliases: ["ilford delta 3200", "delta 3200"],
  },
  {
    id: "ilford-xp2-400",
    brand: "Ilford",
    name: "XP2 Super",
    iso: 400,
    type: "bw",
    // C-41 process black and white.
    process: "c41",
    aliases: ["ilford xp2", "xp2 super", "xp2"],
  },
  {
    id: "kodak-t-max-p3200",
    brand: "Kodak",
    name: "T-MAX P3200",
    iso: 3200,
    type: "bw",
    process: "bw",
    aliases: ["t-max p3200", "tmax p3200", "kodak t-max 3200", "kodak tmax 3200", "t-max 3200"],
  },

  // --- Phase 2 additions (second tier: stocked at two of three surveyed stores) ---

  {
    id: "kentmere-pan-100",
    brand: "Kentmere",
    name: "PAN 100",
    iso: 100,
    type: "bw",
    process: "bw",
    aliases: ["kentmere pan 100", "kentmere 100"],
  },
  {
    id: "kentmere-pan-200",
    brand: "Kentmere",
    name: "PAN 200",
    iso: 200,
    type: "bw",
    process: "bw",
    aliases: ["kentmere pan 200", "kentmere 200"],
  },
  {
    id: "fujifilm-provia-100f",
    brand: "Fujifilm",
    name: "Provia 100F",
    iso: 100,
    type: "color",
    process: "e6",
    aliases: ["provia"],
  },
  {
    id: "fujifilm-velvia-50",
    brand: "Fujifilm",
    name: "Velvia 50",
    iso: 50,
    type: "color",
    process: "e6",
    aliases: ["velvia 50"],
  },
  {
    id: "fujifilm-acros-100",
    brand: "Fujifilm",
    name: "Neopan 100 Acros II",
    iso: 100,
    type: "bw",
    process: "bw",
    // Stores write it "Acros 100 II" and "Acros 100 ll" (lowercase L), so match on
    // the distinctive word alone.
    aliases: ["acros"],
  },
  {
    id: "harman-red-125",
    brand: "Harman",
    name: "RED 125",
    iso: 125,
    type: "color",
    process: "c41",
    // One store writes the speed as "125iso", which no ISO token can match on a word
    // boundary, so "harman red" carries the match. It is specific enough.
    aliases: ["harman red", "red 125 redscale"],
  },
  {
    id: "kodak-pro-image-100",
    brand: "Kodak",
    name: "Pro Image 100",
    iso: 100,
    type: "color",
    process: "c41",
    aliases: ["pro image 100", "kodak pro image"],
  },
  {
    id: "kodak-kodacolor-100",
    brand: "Kodak",
    name: "Kodacolor 100",
    iso: 100,
    type: "color",
    process: "c41",
    // Popho spells it "Kodakcolor".
    aliases: ["kodacolor 100", "kodakcolor 100"],
  },
  {
    id: "kodak-kodacolor-200",
    brand: "Kodak",
    name: "Kodacolor 200",
    iso: 200,
    type: "color",
    process: "c41",
    aliases: ["kodacolor 200", "kodakcolor 200"],
  },
  {
    id: "fomapan-100",
    brand: "Foma",
    name: "Fomapan 100",
    iso: 100,
    type: "bw",
    process: "bw",
    // Covers the Classic and Retro lines; "Foma Ortho 400" is excluded because it
    // does not contain "fomapan".
    aliases: ["fomapan 100"],
  },
  {
    id: "fomapan-200",
    brand: "Foma",
    name: "Fomapan 200",
    iso: 200,
    type: "bw",
    process: "bw",
    aliases: ["fomapan 200"],
  },
  {
    id: "fomapan-400",
    brand: "Foma",
    name: "Fomapan 400",
    iso: 400,
    type: "bw",
    process: "bw",
    aliases: ["fomapan 400"],
  },
  {
    id: "lomography-cn-400",
    brand: "Lomography",
    name: "Color Negative 400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["lomography color negative 400", "lomography cn 400"],
  },
  {
    id: "lomography-cn-800",
    brand: "Lomography",
    name: "Color Negative 800",
    iso: 800,
    type: "color",
    process: "c41",
    aliases: ["lomography color negative 800", "lomography cn 800"],
  },
  {
    id: "lomochrome-metropolis",
    brand: "Lomography",
    name: "LomoChrome Metropolis",
    // Rated ISO 100-400.
    iso: null,
    type: "color",
    process: "c41",
    aliases: ["lomochrome metropolis"],
  },
  {
    id: "cinestill-bwxx",
    brand: "CineStill",
    name: "BwXX",
    iso: 250,
    type: "bw",
    process: "bw",
    // No bare "double-x": Flic Film sells its own Kodak Double-X respool.
    aliases: ["bwxx", "cinestill double-x", "cinestill double x"],
    // CineStill is sold only as 36 exposures.
    defaultExposures: 36,
  },
  {
    id: "flic-aurora-400",
    brand: "Flic Film",
    name: "Aurora 400",
    iso: 400,
    type: "color",
    process: "c41",
    // The ISO is load-bearing: one store sells "Aurora" branded umbrellas and
    // reflectors, which a bare "aurora" alias would match.
    aliases: ["aurora 400"],
  },
  {
    id: "flic-elektra-100",
    brand: "Flic Film",
    name: "Elektra 100",
    iso: 100,
    type: "color",
    process: "c41",
    aliases: ["elektra 100"],
  },

  // Candido: stocked only at Beau Photo, unblocked by its bulk adapter. C-41
  // respools of Kodak Vision3 with the remjet removed (200 <- 200T, 400 <- 250D,
  // 800 <- 500T).
  {
    id: "candido-200",
    brand: "Candido",
    name: "200",
    iso: 200,
    type: "color",
    process: "c41",
    aliases: ["candido 200"],
  },
  {
    id: "candido-400",
    brand: "Candido",
    name: "400",
    iso: 400,
    type: "color",
    process: "c41",
    aliases: ["candido 400"],
  },
  {
    id: "candido-800",
    brand: "Candido",
    name: "800",
    iso: 800,
    type: "color",
    process: "c41",
    aliases: ["candido 800"],
  },
];
