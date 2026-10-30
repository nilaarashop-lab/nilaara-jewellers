import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PRODUCTS, normalizeProducts } from "../data/products";
import { SITE_SETTINGS, normalizeSettings } from "../data/settings";
import { loadBuildContent, loadCommitContent } from "../data/liveContent";
import { CONTENT_EVENT, readContentUpdate } from "../data/repo";

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

// A recent admin save can be used by a newly opened tab on the same device.
const RECENT_UPDATE_MS = 30 * 60 * 1000;

/**
 * Storefront state: the local wishlist plus the Git-managed catalogue and
 * homepage settings.
 *
 * The bundled JSON paints the first frame. The deployed /content snapshot is
 * then polled so open tabs update in place after a build. When staff save in
 * /admin, the exact commit SHA is broadcast so the change appears immediately,
 * without waiting for a build or a GitHub raw cache.
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
  const pendingCommit = useRef("");
  const appliedCommit = useRef("");
  const commitMode = useRef(false);
  const previousPath = useRef(location.pathname);
  // Polling should not churn React state (or restart header search) when the
  // JSON has not actually changed.
  const productsKey = useRef(JSON.stringify(PRODUCTS));
  const settingsKey = useRef(JSON.stringify(SITE_SETTINGS));

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  const applyBuildContent = useCallback((live) => {
    // A commit update is newer than this build. Wait for the build that
    // includes that commit instead of reverting to older content.
    const buildCommit = live.products?._commit || live.settings?._commit || "";
    if (commitMode.current && buildCommit !== appliedCommit.current) return;

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
    commitMode.current = false;
    setContentStatus(live.products || live.settings ? "live" : "fallback");
  }, []);

  const applyCommitContent = useCallback((live, commit) => {
    if (live.products) {
      // Pin upload URLs to this commit: raw branch URLs can serve a cached
      // copy for a few minutes, which would hide a just-uploaded photo.
      const next = normalizeProducts(live.products.products, commit);
      const key = JSON.stringify(next);
      if (key !== productsKey.current) {
        productsKey.current = key;
        setProducts(next);
      }
    }
    if (live.settings) {
      const next = normalizeSettings(live.settings, commit);
      const key = JSON.stringify(next);
      if (key !== settingsKey.current) {
        settingsKey.current = key;
        setSettings(next);
      }
    }
    if (live.products || live.settings) {
      appliedCommit.current = commit;
      commitMode.current = true;
      setContentStatus("live");
    }
  }, []);

  const refreshContent = useCallback(async (commit = "") => {
    if (commit) pendingCommit.current = commit;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        queued.current = false;
        lastRefresh.current = Date.now();
        const targetCommit = pendingCommit.current;
        pendingCommit.current = "";
        if (targetCommit) {
          applyCommitContent(await loadCommitContent(targetCommit), targetCommit);
        } else {
          applyBuildContent(await loadBuildContent());
        }
      } while (queued.current || pendingCommit.current);
    } finally {
      busy.current = false;
    }
  }, [applyBuildContent, applyCommitContent]);

  useEffect(() => {
    const recent = readContentUpdate();
    if (recent?.commit && Date.now() - Number(recent.at || 0) < RECENT_UPDATE_MS) {
      refreshContent(recent.commit);
    } else {
      refreshContent();
    }
  }, [refreshContent]);

  // A long-lived tab should not keep showing an old catalogue. Refresh when the
  // visitor returns to the tab, but not more than once every 10s.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh.current < 10000) return;
      const recent = readContentUpdate();
      if (
        recent?.commit &&
        recent.commit !== appliedCommit.current &&
        Date.now() - Number(recent.at || 0) < RECENT_UPDATE_MS
      ) {
        refreshContent(recent.commit);
      } else {
        refreshContent();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshContent]);

  // Poll the deployed snapshot so a build that finishes while the page is open
  // is picked up in place. The admin route does not need this.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (window.location.pathname.startsWith("/admin")) return;
      refreshContent();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshContent]);

  // Admin saves broadcast the new commit SHA: instantly in other tabs via
  // storage, and in the saving tab via the custom event.
  useEffect(() => {
    const onContentUpdated = (event) => {
      let detail = event?.detail;
      if (event?.type === "storage") {
        if (event.key !== CONTENT_EVENT) return;
        try {
          detail = JSON.parse(event.newValue || "null");
        } catch {
          detail = null;
        }
      }
      if (detail?.commit) refreshContent(detail.commit);
    };
    window.addEventListener("storage", onContentUpdated);
    window.addEventListener(CONTENT_EVENT, onContentUpdated);
    return () => {
      window.removeEventListener("storage", onContentUpdated);
      window.removeEventListener(CONTENT_EVENT, onContentUpdated);
    };
  }, [refreshContent]);

  // Staff often save in /admin and then click straight through to the shop in
  // the same tab. Refresh on the way out so that tab does not show old content.
  useEffect(() => {
    const wasAdmin = previousPath.current.startsWith("/admin");
    const isAdmin = location.pathname.startsWith("/admin");
    previousPath.current = location.pathname;
    if (wasAdmin && !isAdmin) {
      const recent = readContentUpdate();
      if (recent?.commit) refreshContent(recent.commit);
      else refreshContent();
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
