import { useEffect, useMemo, useState } from "react";
import { useAccount } from "./useAccount";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

type FilmRow = { filmId: string; brand: string; name: string; format: "35mm" | "instant" };

function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function AccountPage() {
  const account = useAccount();
  const [address, setAddress] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [films, setFilms] = useState<FilmRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  // Names for the followed films. Both catalogues, since a follow can be either.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch(`${API_BASE}/api/prices?inStock=false`).then((r) => r.json()),
          fetch(`${API_BASE}/api/prices?format=instant&inStock=false`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setFilms(
          [...(a.films ?? []), ...(b.films ?? [])].map((f: any) => ({
            filmId: f.filmId,
            brand: f.brand,
            name: f.name,
            format: f.format ?? "35mm",
          }))
        );
      } catch {
        // Names are a nicety; the list still works with ids.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = useMemo(() => {
    const m = new Map(films.map((f) => [f.filmId, f]));
    return (id: string) => {
      const f = m.get(id);
      return f ? `${f.brand} ${f.name}` : id;
    };
  }, [films]);

  const followed = useMemo(
    () =>
      [...account.follows.values()].sort((x, y) => nameOf(x.filmId).localeCompare(nameOf(y.filmId))),
    [account.follows, nameOf]
  );

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
    setSaved(filmId);
    window.setTimeout(() => setSaved((s) => (s === filmId ? null : s)), 1500);
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
            ← 35mm film
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
        <div className="card">
          <div className="filmName">Sign in</div>
          <p className="muted polaroidNote" style={{ padding: 0, border: "none" }}>
            No password. Enter your email and we’ll send a link that signs you in — it works
            once and expires in 15 minutes.
          </p>
          {sent ? (
            <p className="muted">
              If that address is valid, a sign-in link is on its way. You can close this tab.
            </p>
          ) : (
            <form onSubmit={onRequestLink} className="signInRow">
              <input
                className="search"
                type="email"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
              />
              <button className="backLink" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send link"}
              </button>
            </form>
          )}
        </div>
      )}

      {!account.loading && account.signedIn && (
        <>
          <div className="card polaroidNote">
            Signed in as <strong>{account.email}</strong>. You’ll get an email when a film you
            follow drops below your target price — or falls sharply, if you haven’t set one.
            Prices are checked twice a day.
          </div>

          <div className="card">
            <div className="filmName">Following ({followed.length})</div>
            {followed.length === 0 ? (
              <p className="muted">
                Nothing yet. Use <strong>Follow</strong> on any film in the{" "}
                <a href="#/">35mm</a> or <a href="#/polaroid">Polaroid</a> lists.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Film</th>
                    <th>Alert me under</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {followed.map((f) => (
                    <tr key={f.filmId}>
                      <td>
                        <div className="filmName">{nameOf(f.filmId)}</div>
                      </td>
                      <td>
                        <div className="signInRow">
                          <input
                            className="search targetInput"
                            type="number"
                            min="1"
                            step="0.01"
                            placeholder={
                              f.targetPriceCadCents == null
                                ? "any big drop"
                                : formatCad(f.targetPriceCadCents)
                            }
                            value={
                              draft[f.filmId] ??
                              (f.targetPriceCadCents == null
                                ? ""
                                : (f.targetPriceCadCents / 100).toFixed(2))
                            }
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [f.filmId]: e.target.value }))
                            }
                            aria-label={`Target price for ${nameOf(f.filmId)}`}
                          />
                          <button
                            type="button"
                            className="backLink"
                            onClick={() => void saveTarget(f.filmId)}
                          >
                            {saved === f.filmId ? "Saved" : "Save"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="backLink"
                          onClick={() => void account.unfollow(f.filmId)}
                        >
                          Unfollow
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
