import { Fragment, useEffect, useMemo, useState } from "react";
import { PriceHistoryChart, type PriceHistoryPoint } from "./PriceHistoryChart";
import { useAccount } from "./useAccount";
import { FollowButton } from "./FollowButton";

type Offer = {
  storeId: string;
  storeName: string;
  priceCadCents: number;
  url: string;
  packSize: number | null;
  exposures: 24 | 36 | null;
  isBulk: boolean;
  lastCheckedAt: string;
  inStock?: boolean;
};

type ExpiredDeal = {
  filmId: string;
  brand: string;
  name: string;
  storeId: string;
  storeName: string;
  url: string;
  titleRaw: string;
  expiryLabel: string | null;
  packSize: number;
  isBulk: boolean;
  priceCadCents: number;
  freshPriceCadCents: number;
  discountPercent: number;
};

type MultipackDeal = {
  filmId: string;
  brand: string;
  name: string;
  storeId: string;
  storeName: string;
  url: string;
  packSize: number;
  exposures: number | null;
  priceCadCents: number;
  perRollCadCents: number;
  singlePriceCadCents: number;
  singleStoreName: string;
  savingPercent: number;
};

/** "12/2026" reads as a date; "short dated" is already a phrase. */
function expiryText(label: string | null) {
  if (!label) return null;
  return /\d/.test(label) ? `exp ${label}` : label;
}

/** A 3-pack at $37 is not worse than a single roll at $15 — say which it is. */
function dealUnit(d: { packSize: number; isBulk: boolean }) {
  if (d.isBulk) return "bulk roll";
  if (d.packSize > 1) return `${d.packSize}-pack`;
  return null;
}

type FilmWithTopOffers = {
  filmId: string;
  brand: string;
  name: string;
  iso: number | null;
  type: "color" | "bw";
  process: string | null;
  tier: "core" | "extended";
  offers: Offer[];
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

type Variant = "36" | "24" | "multipack" | "bulk" | "any";
type FilmTypeFilter = "any" | "color" | "bw";

function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    cents / 100
  );
}

/**
 * Squash to letters and digits so punctuation and spacing don't matter: "tmax",
 * "t-max" and "T MAX" all find "Kodak T-MAX 100".
 */
function squash(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function searchHaystack(f: FilmWithTopOffers) {
  return squash(
    [f.brand, f.name, f.iso ?? "", f.process ?? "", f.type === "bw" ? "black white bw" : "colour color"].join(" ")
  );
}

/** Every token must match, so "kodak 400" narrows rather than widening. */
function matchesQuery(f: FilmWithTopOffers, query: string) {
  const tokens = query.split(/\s+/).map(squash).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = searchHaystack(f);
  return tokens.every((t) => hay.includes(t));
}

function variantBadges(o: Offer) {
  const badges: string[] = [];
  if (o.isBulk) badges.push("Bulk");
  if (o.packSize && o.packSize > 1) badges.push(`${o.packSize}-pack`);
  if (o.exposures) badges.push(`${o.exposures} exp`);
  if (badges.length === 0) badges.push("Unknown");
  return badges.join(" · ");
}

type FilmOffersResponse = {
  filmId: string;
  offers: Offer[];
};

export function App() {
  const account = useAccount();
  const [films, setFilms] = useState<FilmWithTopOffers[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("any");
  const [filmType, setFilmType] = useState<FilmTypeFilter>("any");
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [selectedFilmId, setSelectedFilmId] = useState<string | null>(null);
  const [selectedFilmOffers, setSelectedFilmOffers] = useState<Offer[] | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [selectedFilmLoading, setSelectedFilmLoading] = useState(false);
  const [expiredDeals, setExpiredDeals] = useState<ExpiredDeal[] | null>(null);
  const [dealsDismissed, setDealsDismissed] = useState(false);
  const [packDeals, setPackDeals] = useState<MultipackDeal[] | null>(null);
  const [packDismissed, setPackDismissed] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function loadPrices() {
    setError(null);
    let cancelled = false;
    await (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/prices?inStock=${hideOutOfStock ? "true" : "false"}&variant=${variant}&filmType=${filmType}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { films: FilmWithTopOffers[] };
        if (!cancelled) setFilms(json.films);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    void loadPrices();
  }, [variant, hideOutOfStock, filmType]);

  // Expired-stock deals are independent of the table filters, so load them once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/deals/expired`);
        if (!res.ok) return;
        const json = (await res.json()) as { deals: ExpiredDeal[] };
        if (!cancelled) setExpiredDeals(json.deals);
      } catch {
        // A deals failure must never block the price table.
      }
      try {
        const res = await fetch(`${API_BASE}/api/deals/multipacks`);
        if (!res.ok) return;
        const json = (await res.json()) as { deals: MultipackDeal[] };
        if (!cancelled) setPackDeals(json.deals);
      } catch {
        // ditto
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedFilmId(null);
    setSelectedFilmOffers(null);
    setPriceHistory(null);
  }, [filmType]);

  useEffect(() => {
    if (!selectedFilmId) return;
    let cancelled = false;
    void (async () => {
      setSelectedFilmLoading(true);
      setError(null);
      setSelectedFilmOffers(null);
      setPriceHistory(null);
      const q = new URLSearchParams({
        inStock: hideOutOfStock ? "true" : "false",
        variant,
      });
      try {
        const [offersRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/api/films/${encodeURIComponent(selectedFilmId)}/offers?${q}`),
          fetch(`${API_BASE}/api/films/${encodeURIComponent(selectedFilmId)}/price-history?${q}`),
        ]);
        if (cancelled) return;
        if (!offersRes.ok) throw new Error(`Offers HTTP ${offersRes.status}`);
        if (!histRes.ok) throw new Error(`Price history HTTP ${histRes.status}`);
        const offersJson = (await offersRes.json()) as FilmOffersResponse;
        const histJson = (await histRes.json()) as { points: PriceHistoryPoint[] };
        setSelectedFilmOffers(offersJson.offers);
        setPriceHistory(histJson.points);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load film");
      } finally {
        if (!cancelled) setSelectedFilmLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFilmId, variant, hideOutOfStock]);

  const allRows = useMemo(() => films ?? [], [films]);
  const extendedCount = useMemo(
    () => allRows.filter((f) => f.tier === "extended").length,
    [allRows]
  );
  const rows = useMemo(() => {
    // Search deliberately ignores the tier: looking something up should find it
    // whether or not it is in the curated set.
    if (query.trim()) return allRows.filter((f) => matchesQuery(f, query));
    return showAll ? allRows : allRows.filter((f) => f.tier !== "extended");
  }, [allRows, query, showAll]);
  const selectedFilm = useMemo(
    () => (selectedFilmId ? allRows.find((f) => f.filmId === selectedFilmId) ?? null : null),
    [allRows, selectedFilmId]
  );
  const visibleSelectedFilmOffers = useMemo(() => {
    const offers = selectedFilmOffers ?? [];
    if (!hideOutOfStock) return offers;
    // Treat missing as in-stock (older data / backwards compatibility).
    return offers.filter((o) => o.inStock !== false);
  }, [selectedFilmOffers, hideOutOfStock]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">FilmTracker</div>
          <div className="subtitle">Lowest 3 in-stock prices (Canadian stores, 35mm)</div>
        </div>
        <div className="headerActions">
          <a className="backLink" href="#/polaroid">
            Polaroid →
          </a>
          <a className="backLink" href="#/account" title="Price alerts">
            {account.signedIn ? "★ Alerts" : "Sign in"}
          </a>
          <div className="searchWrap">
            <input
              className="search"
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search film, brand or ISO"
              aria-label="Search films"
            />
            {query && (
              <button
                type="button"
                className="searchClear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {extendedCount > 0 && (
            <select
              className="select"
              value={showAll ? "all" : "core"}
              onChange={(e) => setShowAll(e.target.value === "all")}
              aria-label="Which films to show"
            >
              <option value="core">Popular films</option>
              <option value="all">All films ({allRows.length})</option>
            </select>
          )}
          <label className="toggle" title="Hide out of stock offers">
            <input
              type="checkbox"
              checked={hideOutOfStock}
              onChange={(e) => setHideOutOfStock(e.target.checked)}
              disabled={selectedFilmLoading}
            />
            <span>Hide out of stock</span>
          </label>
          <select
            className="select"
            value={filmType}
            onChange={(e) => setFilmType(e.target.value as FilmTypeFilter)}
            aria-label="Film type"
          >
            <option value="any">Color &amp; B&amp;W</option>
            <option value="color">Color only</option>
            <option value="bw">B&amp;W only</option>
          </select>
          <select
            className="select"
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
            aria-label="Variant"
          >
            <option value="36">36 Exposure</option>
            <option value="24">24 Exposure</option>
            <option value="multipack">Multi packs</option>
            <option value="bulk">Bulk</option>
            <option value="any">Any</option>
          </select>
        </div>
      </header>

      {expiredDeals && expiredDeals.length > 0 && !dealsDismissed && (
        <div className="card deals">
          <div className="dealsHead">
            <div className="dealsTitle">
              Expired film deals
              <span className="dealsCount">{expiredDeals.length}</span>
            </div>
            <button
              type="button"
              className="dealsDismiss"
              onClick={() => setDealsDismissed(true)}
              aria-label="Dismiss expired film deals"
            >
              ×
            </button>
          </div>
          <div className="dealsHint">
            In stock and cheaper than the lowest fresh price. Expired film is excluded from the
            table below.
          </div>
          <ul className="dealsList">
            {expiredDeals.map((d) => (
              <li key={`${d.storeId}:${d.url}`} className="dealRow">
                <a className="dealLink" href={d.url} target="_blank" rel="noreferrer noopener">
                  {d.brand} {d.name}
                </a>
                <span className="dealPrice">{formatCad(d.priceCadCents)}</span>
                {dealUnit(d) && <span className="dealUnit">{dealUnit(d)}</span>}
                <span className="dealOff">{d.discountPercent}% off</span>
                <span className="muted dealMeta">
                  {d.storeName}
                  {expiryText(d.expiryLabel) ? ` · ${expiryText(d.expiryLabel)}` : ""} · fresh{" "}
                  {formatCad(d.freshPriceCadCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {packDeals && packDeals.length > 0 && !packDismissed && (
        <div className="card deals dealsPack">
          <div className="dealsHead">
            <div className="dealsTitle">
              Cheaper by the pack
              <span className="dealsCount dealsCountPack">{packDeals.length}</span>
            </div>
            <button
              type="button"
              className="dealsDismiss"
              onClick={() => setPackDismissed(true)}
              aria-label="Dismiss multipack deals"
            >
              ×
            </button>
          </div>
          <div className="dealsHint">
            Multipacks that cost less per roll than the cheapest single roll of the same film
            and exposure count.
          </div>
          <ul className="dealsList">
            {packDeals.map((d) => (
              <li key={`${d.storeId}:${d.url}`} className="dealRow">
                <a className="dealLink" href={d.url} target="_blank" rel="noreferrer noopener">
                  {d.brand} {d.name}
                </a>
                <span className="dealPrice">{formatCad(d.perRollCadCents)}/roll</span>
                <span className="dealUnit">
                  {d.packSize}-pack {formatCad(d.priceCadCents)}
                  {d.exposures ? ` · ${d.exposures} exp` : ""}
                </span>
                <span className="dealOff dealOffPack">{d.savingPercent}% less</span>
                <span className="muted dealMeta">
                  {d.storeName} · vs {formatCad(d.singlePriceCadCents)} single at {d.singleStoreName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="card error">Error: {error}</div>}
      {!error && films === null && <div className="card">Loading…</div>}

      {films && rows.length === 0 && query.trim() && (
        <div className="card emptyState">
          No films match “{query.trim()}”.{" "}
          <button type="button" className="linkBtn" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      )}

      {films && rows.length > 0 && (
        <div className="card cardTable">
          <div className="tableWrap" role="region" aria-label="Film prices table">
            <table className="table">
            <thead>
              <tr>
                <th>Film</th>
                <th>Type</th>
                <th>Top 3 offers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <Fragment key={f.filmId}>
                  <tr
                    className={`clickRow${selectedFilmId === f.filmId ? " clickRowSelected" : ""}`}
                    onClick={() => {
                      setSelectedFilmId((id) => (id === f.filmId ? null : f.filmId));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedFilmId((id) => (id === f.filmId ? null : f.filmId));
                      }
                    }}
                    aria-label={`View all offers for ${f.brand} ${f.name}`}
                    aria-expanded={selectedFilmId === f.filmId}
                  >
                    <td>
                      <div className="filmName">
                        {f.brand} {f.name}
                        {f.iso ? <span className="pill">ISO {f.iso}</span> : null}
                      </div>
                      <FollowButton account={account} filmId={f.filmId} />
                    </td>
                    <td>
                      <span className="pill">{f.type === "bw" ? "B&W" : "Color"}</span>
                      {f.process ? <span className="pill subtle">{f.process.toUpperCase()}</span> : null}
                    </td>
                    <td>
                      <div className="offers">
                        {f.offers.length === 0 ? (
                          <span className="muted">No in-stock offers yet</span>
                        ) : (
                          f.offers.map((o) => (
                            <a
                              key={`${o.storeId}:${o.url}`}
                              className="offer"
                              href={o.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Last checked: ${new Date(o.lastCheckedAt).toLocaleString()}`}
                            >
                              <div className="offerTop">
                                <span className="offerPrice">{formatCad(o.priceCadCents)}</span>
                                <span className="offerStore">{o.storeName}</span>
                              </div>
                              <div className="offerBottom">
                                <span className="offerMeta">{variantBadges(o)}</span>
                              </div>
                            </a>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                  {selectedFilmId === f.filmId && (
                    <tr className="filmDetailRow">
                      <td colSpan={3} className="filmDetailCell">
                        <div className="card filmDetailCard">
                          <div className="detailHeader">
                            <div>
                              <div className="detailTitle">
                                {selectedFilm ? (
                                  <>
                                    {selectedFilm.brand} {selectedFilm.name}
                                    {selectedFilm.iso ? (
                                      <span className="pill">ISO {selectedFilm.iso}</span>
                                    ) : null}
                                  </>
                                ) : (
                                  <>Film details</>
                                )}
                              </div>
                              <div className="subtitle">All scraped offers (sorted by price)</div>
                            </div>
                            <button
                              className="btn"
                              onClick={() => {
                                setSelectedFilmId(null);
                                setSelectedFilmOffers(null);
                                setPriceHistory(null);
                              }}
                              disabled={selectedFilmLoading}
                            >
                              Back
                            </button>
                          </div>

                          {!selectedFilmLoading && priceHistory !== null && (
                            <PriceHistoryChart points={priceHistory} />
                          )}

                          {selectedFilmLoading && <div className="muted">Loading offers…</div>}

                          {!selectedFilmLoading && selectedFilmOffers && (
                            <div className="offerList">
                              {visibleSelectedFilmOffers.length === 0 ? (
                                <div className="muted">No offers yet</div>
                              ) : (
                                visibleSelectedFilmOffers.map((o) => (
                                  <a
                                    key={`${o.storeId}:${o.url}`}
                                    className="offerRow"
                                    href={o.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Last checked: ${new Date(o.lastCheckedAt).toLocaleString()}`}
                                  >
                                    <div className="offerRowLeft">
                                      <div className="offerRowPrice">{formatCad(o.priceCadCents)}</div>
                                      <div className="offerRowMeta">
                                        <span className="pill subtle">{o.storeName}</span>
                                        <span className="pill subtle">{variantBadges(o)}</span>
                                        {o.inStock === false ? (
                                          <span className="pill subtle">Out of stock</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="offerRowRight muted">
                                      {new Date(o.lastCheckedAt).toLocaleDateString("en-CA")}
                                    </div>
                                  </a>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

