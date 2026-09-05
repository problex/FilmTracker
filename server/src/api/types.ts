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


export type ExpiredDealDto = {
  filmId: string;
  brand: string;
  name: string;
  storeId: string;
  storeName: string;
  url: string;
  titleRaw: string;
  /** Expiry as written by the store ("01/2025", "May 2026"), when given. */
  expiryLabel: string | null;
  priceCadCents: number;
  /** Cheapest in-stock, non-expired offer for the same film. */
  freshPriceCadCents: number;
  discountPercent: number;
};
