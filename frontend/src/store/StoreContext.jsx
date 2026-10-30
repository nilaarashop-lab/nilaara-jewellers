import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PRODUCTS, normalizeProducts } from "../data/products";
import { SITE_SETTINGS, normalizeSettings } from "../data/settings";
import { loadLiveContent } from "../data/liveContent";

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const load = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota */
  }
};

/**
 * Storefront state: the local wishlist plus the Git-managed catalogue and
 * homepage settings.
 *
 * The JSON files are bundled so the first paint is instant and offline-safe,
 * then refreshed from the repository in the background. That makes an admin
 * save visible on the next page load without waiting for a Vercel rebuild.
 */
export function StoreProvider({ children }) {
  const location = useLocation();
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));
  const [products, setProducts] = useState(PRODUCTS);
  const [settings, setSettings] = useState(SITE_SETTINGS);
  const [contentStatus, setContentStatus] = useState("loading");
  const lastRefresh = useRef(0);
  const busy = useRef(false);
  const previousPath = useRef(location.pathname);

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  const refreshContent = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const live = await loadLiveContent();
      if (live.products) setProducts(normalizeProducts(live.products.products));
      if (live.settings) setSettings(normalizeSettings(live.settings));
      setContentStatus(live.products || live.settings ? "live" : "fallback");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    lastRefresh.current = Date.now();
    refreshContent();
  }, [refreshContent]);

  // A long-lived tab should not keep showing yesterday's catalogue. Refetch
  // when the visitor returns to the tab, but not more than once every 15s.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < 15000) return;
      lastRefresh.current = Date.now();
      refreshContent();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshContent]);

  // Staff often save in /admin and then click straight through to the shop in
  // the same tab. Refresh on the way out so that tab does not show old content.
  useEffect(() => {
    const wasAdmin = previousPath.current.startsWith("/admin");
    const isAdmin = location.pathname.startsWith("/admin");
    previousPath.current = location.pathname;
    if (wasAdmin && !isAdmin) {
      lastRefresh.current = Date.now();
      refreshContent();
    }
  }, [location.pathname, refreshContent]);

  const toggleWish = (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <StoreCtx.Provider
      value={{
        wishlist,
        toggleWish,
        products,
        settings,
        contentStatus,
        settingsStatus: contentStatus,
      }}
    >
      {children}
    </StoreCtx.Provider>
  );
}
