import { useEffect, useMemo, useState } from "react";
import { useAccount } from "./useAccount";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

type Offer = { priceCadCents: number; storeName: string; packSize: number | null; exposures: number | null };
type FilmRow = {
  filmId: string;
  brand: string;
  name: string;
  iso: number | null;
  format: "35mm" | "instant";
  offers: Offer[];
};

function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

/**
 * Alerts compare instant film per shot, not per pack — see alerts/run.ts. A target set
 * against the pack price would never fire, so the unit has to be on screen wherever a
 * target is entered or a price is shown.
 */
const SHOTS_PER_PACK = 8;

function unitPriceCents(film: FilmRow, offer: Offer) {
  if (film.format !== "instant") return offer.priceCadCents;
  const shots = (offer.exposures ?? SHOTS_PER_PACK) * (offer.packSize ?? 1);
  return shots > 0 ? offer.priceCadCents / shots : offer.priceCadCents;
}

function unitLabel(film: FilmRow) {
  return film.format === "instant" ? "per shot" : "";
}

export function AccountPage() {
  const account = useAccount();
  const [address, setAddress] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [films, setFilms] = useState<Map<string, FilmRow>>(new Map());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  // In-stock offers, so "now" means what you could actually pay today. Films with
  // nothing in stock still come back, with an empty offers list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch(`${API_BASE}/api/prices`).then((r) => r.json()),
          fetch(`${API_BASE}/api/prices?format=instant`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const rows: FilmRow[] = [...(a.films ?? []), ...(b.films ?? [])].map((f: any) => ({
          filmId: f.filmId,
          brand: f.brand,
          name: f.name,
          iso: f.iso ?? null,
          format: f.format ?? "35mm",
          offers: f.offers ?? [],
        }));
        setFilms(new Map(rows.map((f) => [f.filmId, f])));
      } catch {
        // Prices are context, not the point of the page; the list still works without.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const followed = useMemo(() => {
    const rows = [...account.follows.values()].map((follow) => {
      const film = films.get(follow.filmId) ?? null;
      const best = film?.offers[0] ?? null;
      const nowCents = film && best ? unitPriceCents(film, best) : null;
      const target = follow.targetPriceCadCents;
      return {
        follow,
        film,
        best,
        nowCents,
        met: target != null && nowCents != null && nowCents <= target,
      };
    });
    // Anything already at or under its target first — that is the reason to open this
    // page at all. Then the rest by name.
    return rows.sort((x, y) => {
      if (x.met !== y.met) return x.met ? -1 : 1;
      const nx = x.film ? `${x.film.brand} ${x.film.name}` : x.follow.filmId;
      const ny = y.film ? `${y.film.brand} ${y.film.name}` : y.follow.filmId;
      return nx.localeCompare(ny);
    });
  }, [account.follows, films]);

  const metCount = followed.filter((r) => r.met).length;

  async function onRequestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setSending(true);
    try {
      await account.requestLink(address);
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function saveTarget(filmId: string) {
    const raw = (draft[filmId] ?? "").trim();
    const value = raw === "" ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value <= 0)) return;

    await account.follow(filmId, value);
    setDraft((d) => {
      const next = { ...d };
      delete next[filmId];
      return next;
    });
    setSaved(filmId);
    window.setTimeout(() => setSaved((s) => (s === filmId ? null : s)), 1800);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">FilmTracker</div>
          <div className="subtitle">Price alerts for the film you follow</div>
        </div>
        <div className="headerActions">
          <a className="backLink" href="#/">
            35mm
          </a>
          <a className="backLink" href="#/polaroid">
            Polaroid
          </a>
          {account.signedIn && (
            <button type="button" className="backLink" onClick={() => void account.logout()}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {account.loading && <div className="card muted">Loading…</div>}

      {!account.loading && !account.signedIn && (
        <div className="signInCard">
          <div className="signInTitle">Get told when film gets cheaper</div>
          <p className="signInBlurb">
            Follow the films you buy and we’ll email you when one drops below your price.
            Prices are checked twice a day across 10 Canadian stores.
          </p>

          {sent ? (
            <div className="signInSent">
              <div className="signInSentMark">✓</div>
              <div>
                <strong>Check your inbox.</strong>
                <div className="muted signInSentNote">
                  If that address is valid, a sign-in link is on its way. It works once and
                  expires in 15 minutes.
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={onRequestLink} className="signInForm">
              <input
                className="search signInInput"
                type="email"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
              />
              <button className="primaryBtn" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Email me a link"}
              </button>
              <div className="muted signInHint">No password — we send a one-time link.</div>
            </form>
          )}
        </div>
      )}

      {!account.loading && account.signedIn && (
        <>
          <div className="accountBar">
            <div>
              <span className="muted">Signed in as</span> <strong>{account.email}</strong>
            </div>
            <div className="accountStats">
              <span className="pill">{account.follows.size} followed</span>
              {metCount > 0 && <span className="pill pillMet">{metCount} at your price</span>}
            </div>
          </div>

          {followed.length === 0 ? (
            <div className="card emptyState">
              <div className="emptyMark">☆</div>
              <div className="emptyTitle">You’re not following anything yet</div>
              <p className="muted">
                Hit <strong>Follow</strong> on any film to start. Set a price and we’ll email
                you when it drops below it — leave it blank and we’ll tell you about any
                sharp fall instead.
              </p>
              <div className="emptyActions">
                <a className="primaryBtn" href="#/">
                  Browse 35mm
                </a>
                <a className="backLink" href="#/polaroid">
                  Browse Polaroid
                </a>
              </div>
            </div>
          ) : (
            <div className="followList">
              {followed.map(({ follow, film, best, nowCents, met }) => {
                const unit = film ? unitLabel(film) : "";
                const dirty = draft[follow.filmId] != null;
                return (
                  <div className={`followRow${met ? " followRowMet" : ""}`} key={follow.filmId}>
                    <div className="followMain">
                      <div className="filmName">
                        {film ? `${film.brand} ${film.name}` : follow.filmId}
                        {film?.format === "instant" && (
                          <span className="pill pillInstant">Polaroid</span>
                        )}
                        {met && <span className="pill pillMet">At your price</span>}
                      </div>
                      <div className="followNow muted">
                        {nowCents != null && best ? (
                          <>
                            now <span className="followNowPrice">{formatCad(nowCents)}</span>
                            {unit ? ` ${unit}` : ""} at {best.storeName}
                          </>
                        ) : (
                          "no in-stock offers right now"
                        )}
                      </div>
                    </div>

                    <div className="followTarget">
                      <label className="followTargetLabel muted" htmlFor={`t-${follow.filmId}`}>
                        Alert me under{unit ? ` (${unit})` : ""}
                      </label>
                      <div className="followTargetRow">
                        <span className="followCurrency">$</span>
                        <input
                          id={`t-${follow.filmId}`}
                          className="search targetInput"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="any big drop"
                          value={
                            draft[follow.filmId] ??
                            (follow.targetPriceCadCents == null
                              ? ""
                              : (follow.targetPriceCadCents / 100).toFixed(2))
                          }
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [follow.filmId]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveTarget(follow.filmId);
                          }}
                        />
                        <button
                          type="button"
                          className={`primaryBtn saveBtn${dirty ? "" : " saveBtnIdle"}`}
                          onClick={() => void saveTarget(follow.filmId)}
                        >
                          {saved === follow.filmId ? "Saved ✓" : "Save"}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="removeBtn"
                      title="Stop following"
                      aria-label={`Stop following ${film ? film.name : follow.filmId}`}
                      onClick={() => void account.unfollow(follow.filmId)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="muted accountFooter">
            Checked twice a day. Emails come from info@problex.com and link straight to the
            store — every one has an unsubscribe link.
          </p>
        </>
      )}
    </div>
  );
}
