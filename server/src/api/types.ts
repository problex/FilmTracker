export type OfferDto = {
  storeId: string;
  storeName: string;
  priceCadCents: number;
  url: string;
  packSize: number | null;
  exposures: 24 | 36 | null;
  isBulk: boolean;
  lastCheckedAt: string;
};

export type FilmWithTopOffersDto = {
  filmId: string;
  brand: string;
  name: string;
  iso: number | null;
  type: "color" | "bw";
  process: string | null;
  offers: OfferDto[];
};

