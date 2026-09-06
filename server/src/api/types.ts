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
  /** `core` is the curated default view; `extended` is shown on request. */
  tier: "core" | "extended";
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
  /** 1 for a single roll; larger for a multipack. */
  packSize: number;
  isBulk: boolean;
  priceCadCents: number;
  /** Cheapest in-stock, non-expired offer for the same film. */
  freshPriceCadCents: number;
  discountPercent: number;
};

export type MultipackDealDto = {
  filmId: string;
  brand: string;
  name: string;
  storeId: string;
  storeName: string;
  url: string;
  titleRaw: string;
  packSize: number;
  exposures: number | null;
  /** Price of the whole pack. */
  priceCadCents: number;
  /** Pack price divided by pack size. */
  perRollCadCents: number;
  /** Cheapest comparable single roll anywhere, and where it is. */
  singlePriceCadCents: number;
  singleStoreName: string;
  savingPercent: number;
};

export type HealthIssueDto = {
  severity: "error" | "warn";
  storeId: string | null;
  kind: "no_listings" | "truncated" | "listing_drop" | "stale" | "film_no_offers" | "film_not_seeded";
  detail: string;
};

export type StoreHealthDto = {
  storeId: string;
  storeName: string;
  /** Listings seen within the freshness window. */
  freshListings: number;
  /** From the latest finished run; null when the store did not run. */
  inserted: number | null;
  previousInserted: number | null;
  truncated: boolean | null;
  mode: string | null;
  durationMs: number | null;
  errorCount: number | null;
};
