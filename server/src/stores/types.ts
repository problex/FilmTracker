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
  /** Stock the store itself marks as expired; excluded from headline prices. */
  isExpired: boolean;
  /** Expiry as written by the store ("01/2025", "May 2026"), when given. */
  expiryLabel: string | null;
  lastCheckedAt: Date;
};

/** Candidates for every film, keyed by `FilmSeed.id`. */
export type CandidatesByFilmId = Map<string, ListingCandidate[]>;

export type StoreAdapter = {
  storeId: string;
  storeName: string;
  baseUrl: string;
  fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]>;
  /**
   * Bulk mode: fetch the store's whole catalogue in a couple of requests and match
   * every film locally, instead of one search per film.
   *
   * A per-film search costs ~5.5s, so a 17-film catalogue overran the 90s per-store
   * budget and silently dropped every film past ~index 10. Bulk mode makes the cost
   * independent of catalogue size. Implemented where the store exposes a catalogue
   * endpoint (Shopify, WooCommerce Store API); browser-driven stores stay per-film.
   */
  fetchCandidatesForAllFilms?(films: FilmSeed[]): Promise<CandidatesByFilmId>;
};

