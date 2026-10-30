import { createContext, useContext, useEffect, useState } from "react";
import { fetchSettings } from "../api/client";

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
 * Storefront state: the wishlist (local-only, no account needed) and the
 * public settings that drive the announcement bar and admin-managed homepage
 * content. There is no cart or customer session — every purchase conversation
 * happens on WhatsApp from the product page/card.
 */
export function StoreProvider({ children }) {
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));
  const [settings, setSettings] = useState(null); // public storefront settings

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  // Public settings (announcement bar + homepage hero/cards/festive content).
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((s) => alive && s && setSettings(s))
      .catch(() => {
        /* the built-in homepage copy is used when settings are unavailable */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Admin saves new homepage/coupon settings → refresh the storefront without
  // a full page reload.
  useEffect(() => {
    const onUpdate = () => {
      fetchSettings()
        .then((s) => s && setSettings(s))
        .catch(() => {});
    };
    window.addEventListener("nilaara:settings-updated", onUpdate);
    return () => window.removeEventListener("nilaara:settings-updated", onUpdate);
  }, []);

  const toggleWish = (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return <StoreCtx.Provider value={{ wishlist, toggleWish, settings }}>{children}</StoreCtx.Provider>;
}
