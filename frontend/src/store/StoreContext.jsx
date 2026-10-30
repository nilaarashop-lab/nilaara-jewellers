import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PRODUCTS, normalizeProducts } from "../data/products";
import { SITE_SETTINGS, normalizeSettings } from "../data/settings";
import { loadLiveContent } from "../data/liveContent";
import { CONTENT_EVENT } from "../data/repo";

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
 * then refreshed from the repository in the background and on a short poll.
 * An admin save updates the page in place — no reload and no Vercel rebuild.
 */
export function StoreProvider({ children }) {
  const location = useLocation();
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));
  const [products, setProducts] = useState(PRODUCTS);
  const [settings, setSettings] = useState(SITE_SETTINGS);
  const [contentStatus, setContentStatus] = useState("loading");
  const lastRefresh = useRef(0);
  const busy = useRef(false);
  const queued = useRef(false);
  const previousPath = useRef(location.pathname);
  // Polling should not churn React state (or restart header search) when the
  // JSON has not actually changed.
  const productsKey = useRef(JSON.stringify(PRODUCTS));
  const settingsKey = useRef(JSON.stringify(SITE_SETTINGS));

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  const refreshContent = useCallback(async () => {
    if (busy.current) {
      // A save landed while a fetch was in flight — run once more when it ends.
      queued.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        queued.current = false;
        lastRefresh.current = Date.now();
        const live = await loadLiveContent();
        if (live.products) {
          const next = normalizeProducts(live.products.products);
          const key = JSON.stringify(next);
          if (key !== productsKey.current) {
            productsKey.current = key;
            setProducts(next);
          }
        }
        if (live.settings) {
          const next = normalizeSettings(live.settings);
          const key = JSON.stringify(next);
          if (key !== settingsKey.current) {
            settingsKey.current = key;
            setSettings(next);
          }
        }
        setContentStatus(live.products || live.settings ? "live" : "fallback");
      } while (queued.current);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    refreshContent();
  }, [refreshContent]);

  // A long-lived tab should not keep showing yesterday's catalogue. Refetch
  // when the visitor returns to the tab, but not more than once every 10s.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < 10000) return;
      refreshContent();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshContent]);

  // Keep an open storefront tab current even while it stays focused (for
  // example, a preview window beside the admin). React swaps the content in
  // place — no page reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (window.location.pathname.startsWith("/admin")) return;
      refreshContent();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshContent]);

  // Saves in another tab on this device bump a localStorage key, so the
  // storefront can update immediately instead of waiting for the next poll.
  useEffect(() => {
    const onContentUpdated = (event) => {
      if (event.key === CONTENT_EVENT) refreshContent();
    };
    window.addEventListener("storage", onContentUpdated);
    return () => window.removeEventListener("storage", onContentUpdated);
  }, [refreshContent]);

  // Staff often save in /admin and then click straight through to the shop in
  // the same tab. Refresh on the way out so that tab does not show old content.
  useEffect(() => {
    const wasAdmin = previousPath.current.startsWith("/admin");
    const isAdmin = location.pathname.startsWith("/admin");
    previousPath.current = location.pathname;
    if (wasAdmin && !isAdmin) refreshContent();
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
