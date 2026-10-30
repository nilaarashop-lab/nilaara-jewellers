import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchSettings, hasAPI } from "../api/client";

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

/**
 * Last-known public settings. Storefront content (hero, announcement, promo
 * cards) is admin-managed, so on a cold visit the API answer arrives a moment
 * after React paints — without a cache the page shows the built-in copy first
 * and then visibly swaps to the real content. Hydrating from this cache means
 * repeat visitors see the correct content on the very first paint while a
 * fresh copy is fetched in the background.
 */
const SETTINGS_KEY = "nilaara-settings-v1";

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
 * Storefront state: the wishlist (local-only, no account needed) and the
 * public settings that drive the announcement bar and admin-managed homepage
 * content. There is no cart or customer session — every purchase conversation
 * happens on WhatsApp from the product page/card.
 */
export function StoreProvider({ children }) {
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));
  // Seed from the cache so the first paint already has the real admin content.
  const [settings, setSettings] = useState(() => (hasAPI ? load(SETTINGS_KEY, null) : null));
  const [settingsStatus, setSettingsStatus] = useState(() => (hasAPI && !settings ? "loading" : "ready"));

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  const applySettings = useCallback((s) => {
    if (!s) return;
    setSettings(s);
    if (hasAPI) save(SETTINGS_KEY, s);
  }, []);

  // Public settings (announcement bar + homepage hero/cards/festive content).
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((s) => {
        if (!alive) return;
        applySettings(s);
        setSettingsStatus("ready");
      })
      .catch(() => {
        // Keep the cached copy if we have one; the built-in homepage copy is
        // used only when there is nothing cached.
        if (alive) setSettingsStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [applySettings]);

  // Admin saves new homepage/coupon settings → refresh the storefront without
  // a full page reload.
  useEffect(() => {
    const onUpdate = () => {
      fetchSettings()
        .then((s) => {
          applySettings(s);
          setSettingsStatus("ready");
        })
        .catch(() => {});
    };
    window.addEventListener("nilaara:settings-updated", onUpdate);

    // Keep other tabs in sync when one of them receives fresh settings.
    const onStorage = (e) => {
      if (e.key !== SETTINGS_KEY || !e.newValue) return;
      try {
        setSettings(JSON.parse(e.newValue));
        setSettingsStatus("ready");
      } catch {
        /* ignore a malformed cache entry */
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("nilaara:settings-updated", onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [applySettings]);

  const toggleWish = (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <StoreCtx.Provider value={{ wishlist, toggleWish, settings, settingsStatus }}>
      {children}
    </StoreCtx.Provider>
  );
}
