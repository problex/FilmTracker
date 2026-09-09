import { useEffect, useState } from "react";
import { App } from "./App";
import { PolaroidPage } from "./PolaroidPage";

/**
 * Hash routing, deliberately without a router dependency.
 *
 * Two pages do not justify react-router, and a hash route needs no server rewrite —
 * the site is served by `vite preview` behind a proxy, where a real path would 404 on
 * a hard refresh. `#/polaroid` is bookmarkable and survives a reload.
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

  return route === "polaroid" ? <PolaroidPage /> : <App />;
}
