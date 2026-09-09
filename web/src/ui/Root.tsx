import { useEffect, useState } from "react";
import { App } from "./App";
import { PolaroidPage } from "./PolaroidPage";
import { AccountPage } from "./AccountPage";

/**
 * Hash routing, deliberately without a router dependency.
 *
 * A handful of pages do not justify react-router, and a hash route needs no server
 * rewrite — the site is served by `vite preview` behind a proxy, where a real path
 * would 404 on a hard refresh. `#/polaroid` and `#/account` are bookmarkable and
 * survive a reload, which matters for `#/account`: the sign-in email redirects there.
 */
function currentRoute() {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
}

export function Root() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "polaroid") return <PolaroidPage />;
  if (route === "account") return <AccountPage />;
  return <App />;
}
