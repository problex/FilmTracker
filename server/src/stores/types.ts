import type { FilmSeed } from "../catalog/films.js";

export type ListingCandidate = {
  url: string;
  titleRaw: string;
  priceCadCents: number;
  currency: "CAD";
  inStock: boolean;
  packSize: number | null;
  exposures: 24 | 36 | null;
  isBulk: boolean;
  lastCheckedAt: Date;
};

export type StoreAdapter = {
  storeId: string;
  storeName: string;
  baseUrl: string;
  fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]>;
};

