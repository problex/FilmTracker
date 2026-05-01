import { Fragment, useEffect, useMemo, useState } from "react";
import { PriceHistoryChart, type PriceHistoryPoint } from "./PriceHistoryChart";

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

type FilmWithTopOffers = {
  filmId: string;
  brand: string;
  name: string;
  iso: number | null;
  type: "color" | "bw";
  process: string | null;
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
  const [films, setFilms] = useState<FilmWithTopOffers[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("any");
  const [filmType, setFilmType] = useState<FilmTypeFilter>("any");
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [selectedFilmId, setSelectedFilmId] = useState<string | null>(null);
  const [selectedFilmOffers, setSelectedFilmOffers] = useState<Offer[] | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [selectedFilmLoading, setSelectedFilmLoading] = useState(false);

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

  const rows = useMemo(() => films ?? [], [films]);
  const selectedFilm = useMemo(
    () => (selectedFilmId ? rows.find((f) => f.filmId === selectedFilmId) ?? null : null),
    [rows, selectedFilmId]
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

      {error && <div className="card error">Error: {error}</div>}
      {!error && films === null && <div className="card">Loading…</div>}

      {films && (
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

