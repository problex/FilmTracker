import { useEffect, useMemo, useState } from "react";
import { useAccount } from "./useAccount";
import { FollowButton } from "./FollowButton";

type Offer = {
  storeId: string;
  storeName: string;
  priceCadCents: number;
  url: string;
  packSize: number | null;
  exposures: number | null;
  isBulk: boolean;
  lastCheckedAt: string;
  inStock?: boolean;
};

type InstantFilm = {
  filmId: string;
  brand: string;
  name: string;
  iso: number | null;
  type: "color" | "bw";
  process: string | null;
  tier: "core" | "extended";
  format: "35mm" | "instant";
  offers: Offer[];
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * A pack holds 8 shots, and a multipack multiplies that. Price per shot is the only
 * figure that compares a single pack against a twin pack against Studio Argentique's
 * five-pack, so it is what the page sorts and leads on.
 */
const SHOTS_PER_PACK = 8;

function shotsIn(o: Offer) {
  return (o.exposures ?? SHOTS_PER_PACK) * (o.packSize ?? 1);
}

function perShotCents(o: Offer) {
  const shots = shotsIn(o);
  return shots > 0 ? o.priceCadCents / shots : null;
}

function formatPerShot(o: Offer) {
  const c = perShotCents(o);
  return c == null ? null : `${formatCad(c)}/shot`;
}

function packLabel(o: Offer) {
  const shots = shotsIn(o);
  if (o.packSize && o.packSize > 1) return `${o.packSize} packs · ${shots} shots`;
  return `${shots} shots`;
}

/**
 * Which camera a pack fits — the thing that actually decides the purchase. A 600 pack
 * carries the battery that powers a vintage 600 body, and an i-Type pack does not, so
 * 600 film works in both while i-Type film only works in newer bodies.
 */
function cameraFit(filmId: string) {
  if (filmId.startsWith("polaroid-600")) return "600 cameras · also fits i-Type";
  if (filmId.startsWith("polaroid-sx70")) return "SX-70 cameras";
  if (filmId.startsWith("polaroid-itype")) return "i-Type cameras only";
  return null;
}

export function PolaroidPage() {
  const account = useAccount();
  const [films, setFilms] = useState<InstantFilm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideOutOfStock, setHideOutOfStock] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/prices?format=instant&inStock=${hideOutOfStock ? "true" : "false"}`
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const body = (await res.json()) as { films: InstantFilm[] };
        if (!cancelled) {
          setFilms(body.films ?? []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hideOutOfStock]);

  // Cheapest per shot first, so the best value leads regardless of pack size. Films
  // with no offers sink to the bottom rather than disappearing — that a format is
  // unstocked in Canada is worth seeing.
  const rows = useMemo(() => {
    if (!films) return [];
    const best = (f: InstantFilm) =>
      f.offers.reduce<number | null>((lo, o) => {
        const c = perShotCents(o);
        return c == null ? lo : lo == null || c < lo ? c : lo;
      }, null);
    return [...films].sort((a, b) => {
      const x = best(a);
      const y = best(b);
      if (x == null && y == null) return a.name.localeCompare(b.name);
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y;
    });
  }, [films]);

  const stocked = rows.filter((f) => f.offers.length > 0).length;

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">
            FilmTracker <span className="pill pillInstant">Polaroid</span>
          </div>
          <div className="subtitle">
            Instant film from Canadian stores, cheapest per shot
          </div>
        </div>
        <div className="headerActions">
          <a className="backLink" href="#/">
            ← 35mm film
          </a>
          <a className="backLink" href="#/account" title="Price alerts">
            {account.signedIn ? "★ Alerts" : "Sign in"}
          </a>
          <label className="toggle" title="Hide out of stock offers">
            <input
              type="checkbox"
              checked={hideOutOfStock}
              onChange={(e) => setHideOutOfStock(e.target.checked)}
            />
            In stock only
          </label>
        </div>
      </header>

      <div className="card polaroidNote">
        A pack is {SHOTS_PER_PACK} shots, so a twin pack at twice the price is the same value —
        the per-shot figure is what separates them. 600 film carries the battery that powers
        vintage 600 cameras; i-Type film does not, so newer i-Type bodies can shoot either.
      </div>

      {error && <div className="card error">Couldn’t load prices: {error}</div>}

      {!films && !error && <div className="card muted">Loading…</div>}

      {films && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Film</th>
                <th>Fits</th>
                <th>Offers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.filmId}>
                  <td>
                    <div className="filmName">
                      {f.brand} {f.name}
                      {f.iso ? <span className="pill">ISO {f.iso}</span> : null}
                    </div>
                    <span className="pill subtle">{f.type === "bw" ? "B&W" : "Colour"}</span>
                    <FollowButton account={account} filmId={f.filmId} />
                  </td>
                  <td>
                    <span className="muted">{cameraFit(f.filmId) ?? "—"}</span>
                  </td>
                  <td>
                    <div className="offers">
                      {f.offers.length === 0 ? (
                        // Two different facts, and conflating them misleads: i-Type is
                        // carried by Studio Argentique but is routinely out of stock,
                        // which is not the same as no Canadian store selling it.
                        <span className="muted">
                          {hideOutOfStock
                            ? "None in stock right now — untick “In stock only” to see prices"
                            : "Not stocked by any tracked Canadian store"}
                        </span>
                      ) : (
                        f.offers.map((o) => (
                          <a
                            key={`${o.storeId}:${o.url}`}
                            className="offer"
                            href={o.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={`Last checked: ${new Date(o.lastCheckedAt).toLocaleString()}`}
                          >
                            <div className="offerTop">
                              <span className="offerPrice">{formatPerShot(o)}</span>
                              <span className="offerStore">{o.storeName}</span>
                            </div>
                            <div className="offerBottom">
                              <span className="offerMeta">
                                {formatCad(o.priceCadCents)} · {packLabel(o)}
                              </span>
                            </div>
                          </a>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="polaroidFooter muted">
        {stocked} of {rows.length} Polaroid films currently stocked. Prices refresh nightly.
      </div>
    </div>
  );
}
