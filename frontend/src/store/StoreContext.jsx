import { createContext, useContext, useEffect, useState } from "react";
import { SITE_SETTINGS } from "../data/settings";

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
 * Storefront state: the local wishlist and the Git-managed homepage settings.
 *
 * There is no cart or customer session. Product data and settings are compiled
 * into the site, so the first paint already has the real content and there is
 * nothing to wait for or retry.
 */
export function StoreProvider({ children }) {
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));

  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);

  const toggleWish = (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <StoreCtx.Provider
      value={{ wishlist, toggleWish, settings: SITE_SETTINGS, settingsStatus: "ready" }}
    >
      {children}
    </StoreCtx.Provider>
  );
}
