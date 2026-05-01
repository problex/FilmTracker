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
    aliases: [
      "kentmere pan 400",
      "kentmere 400",
      "kentmere pan400",
      "pan 400 kentmere",
      "kentmere pan",
    ],
  }
];

