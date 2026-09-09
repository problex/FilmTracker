import { useCallback, useEffect, useState } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

/**
 * `credentials: "include"` on every call. In production the browser talks to the same
 * origin through the reverse proxy and it makes no difference, but local dev runs the
 * app on :5173 against the API on :4000, and without it the session cookie is dropped
 * and sign-in appears to do nothing at all.
 */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export type Follow = { filmId: string; targetPriceCadCents: number | null };

export type Account = {
  email: string | null;
  loading: boolean;
  follows: Map<string, Follow>;
  signedIn: boolean;
  refresh: () => Promise<void>;
  follow: (filmId: string, targetPriceCad?: number | null) => Promise<void>;
  unfollow: (filmId: string) => Promise<void>;
  requestLink: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

export function useAccount(): Account {
  const [email, setEmail] = useState<string | null>(null);
  const [follows, setFollows] = useState<Map<string, Follow>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: { email: string } | null }>("/api/auth/me");
      setEmail(me.user?.email ?? null);

      if (me.user) {
        const list = await api<{ follows: Follow[] }>("/api/follows");
        setFollows(new Map(list.follows.map((f) => [f.filmId, f])));
      } else {
        setFollows(new Map());
      }
    } catch {
      // Signed out, or the API is unreachable. Either way the price pages stay
      // usable — following is the only thing that needs an account.
      setEmail(null);
      setFollows(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const follow = useCallback(async (filmId: string, targetPriceCad: number | null = null) => {
    const saved = await api<{ filmId: string; targetPriceCadCents: number | null }>(
      "/api/follows",
      { method: "PUT", body: JSON.stringify({ filmId, targetPriceCad }) }
    );
    setFollows((prev) => {
      const next = new Map(prev);
      next.set(filmId, { filmId, targetPriceCadCents: saved.targetPriceCadCents });
      return next;
    });
  }, []);

  const unfollow = useCallback(async (filmId: string) => {
    await api(`/api/follows/${encodeURIComponent(filmId)}`, { method: "DELETE" });
    setFollows((prev) => {
      const next = new Map(prev);
      next.delete(filmId);
      return next;
    });
  }, []);

  const requestLink = useCallback(async (address: string) => {
    await api("/api/auth/request-link", {
      method: "POST",
      body: JSON.stringify({ email: address }),
    });
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setEmail(null);
    setFollows(new Map());
  }, []);

  return {
    email,
    loading,
    follows,
    signedIn: email != null,
    refresh,
    follow,
    unfollow,
    requestLink,
    logout,
  };
}
