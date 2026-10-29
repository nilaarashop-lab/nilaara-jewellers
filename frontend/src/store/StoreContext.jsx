import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  hasAPI,
  fetchCart,
  fetchProduct,
  cartAdd,
  cartMerge,
  cartSetQty,
  cartRemove,
  cartClear,
  fetchSettings,
  fetchActivePromos,
  peekPendingIntent,
  setPendingIntent,
  clearPendingIntent,
} from "../api/client";

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const load = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch { return fb; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
};

/**
 * Promo chips must mirror the SERVER rules: "FLAT25" is the legacy
 * settings-driven code (the server ignores any PromoCode record for it and
 * reads settings.coupons.flat25), so its chip is derived from settings and
 * dropped when the admin switches it off. All other codes come from the
 * PromoCode collection unchanged.
 */
const mergePromos = (list, s) => {
  const rest = (list || []).filter((p) => String(p.code).toUpperCase() !== "FLAT25");
  const f = s?.coupons?.flat25;
  if (f?.enabled === false) return rest;
  return [...rest, { code: "FLAT25", percent: f?.percent ?? 25, minSubtotal: f?.minSubtotal ?? 1000, description: "" }];
};

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [cart, setCart] = useState(() => load("nilaara-cart", []));
  const [wishlist, setWishlist] = useState(() => load("nilaara-wish", []));
  const [coupon, setCoupon] = useState(() => load("nilaara-coupon", ""));
  const [cartOpen, setCartOpen] = useState(false);
  const [cartReady, setCartReady] = useState(!hasAPI);
  const [settings, setSettings] = useState(null); // public storefront settings
  const [promos, setPromos] = useState([]); // active promo codes (chips on bag/checkout)
  const [loginPrompt, setLoginPrompt] = useState(null); // { title, detail }
  const [toast, setToast] = useState(null); // { msg, tone }
  const toastTimer = useRef(null);

  const userId = user?.id || null;
  const showToast = (msg, tone = "ok") => {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  const nextParam = location.pathname + location.search;

  // ── Server cart sync ──────────────────────────────────────────
  // Logged in  → the MongoDB cart is authoritative; a leftover guest cart is
  //              merged into it exactly once, then cleared locally.
  // Logged out → the local guest cart (only reachable in demo mode, since the
  //              storefront blocks guests from adding) is restored.
  // A refresh therefore never loses the bag: it is re-read from the server.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!hasAPI) {
        // Demo mode: cart lives in localStorage. After a demo login, replay
        // the action the visitor tried as a guest (mirrors the API flow).
        let localCart = load("nilaara-cart", []);
        if (userId) {
          const pending = peekPendingIntent();
          console.log("[DBG] pending", JSON.stringify(pending));
          if (pending) {
            clearPendingIntent();
            if (pending.type === "add") {
              try {
                const p = await fetchProduct(pending.id);
                if (p) {
                  const qty = pending.qty || 1;
                  const found = localCart.find((i) => i.id === p.id);
                  localCart = found
                    ? localCart.map((i) => (i.id === p.id ? { ...i, qty: i.qty + qty } : i))
                    : [...localCart, { id: p.id, name: p.name, price: p.price, mrp: p.mrp, image: p.images?.[0], plating: p.plating, qty }];
                  console.log("[DBG] replay localCart", JSON.stringify(localCart));
                  setCartOpen(true);
                  showToast("Signed in — item added to your bag.");
                }
              } catch {
                /* product unavailable — nothing to add */
              }
            } else if (pending.type === "checkout") {
              nav("/checkout");
            }
          }
        }
        setCart(localCart);
        setCartReady(true);
        return;
      }
      try {
        if (userId) {
          const guest = load("nilaara-cart", []);
          let items;
          if (guest.length) {
            items = await cartMerge(guest.map((i) => ({ id: i.id, qty: i.qty })));
            save("nilaara-cart", []); // merged — no double counting later
          } else {
            items = await fetchCart();
          }
          if (!alive) return;
          setCart(items);
          setCartReady(true);

          // Complete an action the visitor started before logging in.
          const pending = peekPendingIntent();
          if (pending) {
            clearPendingIntent();
            if (pending.type === "add") {
              try {
                const next = await cartAdd(pending.id, pending.qty || 1);
                if (alive) { setCart(next); setCartOpen(true); showToast("Signed in — item added to your bag."); }
              } catch (e) {
                if (alive) showToast(e.message, "err");
              }
            } else if (pending.type === "checkout") {
              nav("/checkout");
            }
          }
        } else {
          setCart(load("nilaara-cart", []));
          setCartReady(true);
        }
      } catch (e) {
        if (alive) {
          setCartReady(true);
          showToast(e.message || "Could not load your bag.", "err");
        }
      }
    })();
    return () => { alive = false; };
    // `nav` is intentionally NOT a dependency: useNavigate's identity changes
    // on every route change, and a re-run would clobber in-memory cart state
    // (a replayed add) with a stale localStorage snapshot. nav stays valid
    // from this render's closure for the pending-checkout redirect.
  }, [userId]);

  // Public settings (delivery methods + payment availability) + active promo
  // codes — loaded once.
  useEffect(() => {
    let alive = true;
    Promise.all([fetchSettings().catch(() => null), fetchActivePromos().catch(() => [])])
      .then(([s, p]) => {
        if (!alive) return;
        if (s) setSettings(s);
        setPromos(mergePromos(p, s));
      });
    return () => { alive = false; };
  }, []);

  // Refetch when the admin saves new homepage/coupon settings, so the
  // storefront picks the changes up without a full page reload.
  useEffect(() => {
    const onUpdate = () => {
      Promise.all([fetchSettings().catch(() => null), fetchActivePromos().catch(() => [])])
        .then(([s, p]) => {
          if (s) setSettings(s);
          setPromos(mergePromos(p, s));
        });
    };
    window.addEventListener("nilaara:settings-updated", onUpdate);
    return () => window.removeEventListener("nilaara:settings-updated", onUpdate);
  }, []);

  // Persist only the GUEST cart (demo mode or pre-login leftovers). The
  // signed-in cart lives in MongoDB, so a refresh/another device sees it too.
  useEffect(() => {
    if (!hasAPI || !userId) save("nilaara-cart", cart);
  }, [cart, userId]);
  useEffect(() => save("nilaara-wish", wishlist), [wishlist]);
  useEffect(() => save("nilaara-coupon", coupon), [coupon]);

  // ── Login gate ────────────────────────────────────────────────
  // Guests never mutate the cart; their intent is saved and replayed after
  // the login round trip (see the sync effect above).
  const gateForGuest = (intent, title, detail) => {
    setPendingIntent({ ...intent, next: nextParam });
    setLoginPrompt({ title, detail });
    return true;
  };
  const closeLoginPrompt = () => setLoginPrompt(null);
  useEffect(() => {
    if (!loginPrompt) return;
    const onKey = (e) => { if (e.key === "Escape") closeLoginPrompt(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loginPrompt]);

  // ── Cart mutations ────────────────────────────────────────────
  const addToCart = async (p, qty = 1) => {
    if (!userId) {
      return gateForGuest(
        { type: "add", id: p.id, qty },
        "Log in to add to your bag",
        "Your bag is stored with your account, so it stays in sync across devices. We'll finish adding this item right after you sign in."
      );
    }
    if (!hasAPI) {
      setCart((c) => {
        const f = c.find((i) => i.id === p.id);
        if (f) return c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + qty } : i));
        return [...c, { id: p.id, name: p.name, price: p.price, mrp: p.mrp, image: p.images?.[0], plating: p.plating, qty }];
      });
      setCartOpen(true);
      return;
    }
    try {
      const items = await cartAdd(p.id, qty); // server validates availability/stock
      setCart(items);
      setCartOpen(true);
      showToast(`Added — ${p.name}`);
    } catch (e) {
      showToast(e.message, "err"); // out of stock / unpublished / server error
    }
  };

  const updateQty = async (id, qty) => {
    if (!hasAPI) {
      setCart((c) => (qty <= 0 ? c.filter((i) => i.id !== id) : c.map((i) => (i.id === id ? { ...i, qty } : i))));
      return;
    }
    // Optimistic update for instant feedback, then reconcile with the server
    // (which enforces stock limits and returns the authoritative list).
    const before = cart;
    setCart((c) => (qty <= 0 ? c.filter((i) => i.id !== id) : c.map((i) => (i.id === id ? { ...i, qty } : i))));
    try {
      setCart(await cartSetQty(id, qty));
    } catch (e) {
      setCart(before);
      showToast(e.message, "err");
    }
  };

  const removeItem = async (id) => {
    if (!hasAPI) { setCart((c) => c.filter((i) => i.id !== id)); return; }
    const before = cart;
    setCart((c) => c.filter((i) => i.id !== id));
    try {
      setCart(await cartRemove(id));
    } catch (e) {
      setCart(before);
      showToast(e.message, "err");
    }
  };

  const clearCart = async () => {
    setCoupon("");
    if (!hasAPI) { setCart([]); return; }
    try { setCart(await cartClear()); } catch { /* cart is re-read on next load */ }
  };

  const toggleWish = (id) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  const totals = useMemo(() => {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const mrp = cart.reduce((s, i) => s + (i.mrp || i.price) * i.qty, 0);
    let discount = mrp - sub;
    let couponOff = 0;
    // Promo code (admin-configured): percent off when the subtotal qualifies.
    const promo = promos.find((p) => String(p.code).toUpperCase() === String(coupon || "").toUpperCase());
    if (promo && sub >= Number(promo.minSubtotal || 0)) couponOff = Math.round(sub * (Number(promo.percent) / 100));
    // Auto B1G1 (sitewide switch + per-product tag) when no promo is chosen.
    if (!promo && settings?.coupons?.b1g1?.enabled) {
      couponOff = cart.reduce((s, i) => (String(i.tag || "").toLowerCase() === "b1g1 free" ? s + Math.floor(i.qty / 2) * i.price : s), 0);
    }
    // Display-only estimate; the checkout screen always shows the SERVER total.
    const freeOver = Number(settings?.shipping?.freeOver ?? 999);
    const fee = Number(settings?.shipping?.fee ?? 79);
    const shipping = sub === 0 ? 0 : sub - couponOff >= freeOver ? 0 : fee;
    const total = Math.max(0, sub - couponOff + shipping);
    return { sub, mrp, discount, couponOff, shipping, total, count: cart.reduce((s, i) => s + i.qty, 0) };
  }, [cart, coupon, settings, promos]);

  const value = {
    cart, wishlist, coupon, setCoupon, cartOpen, setCartOpen,
    addToCart, updateQty, removeItem, clearCart, toggleWish, totals,
    cartReady, settings, promos,
    loginPrompt, requireLogin: gateForGuest, closeLoginPrompt,
    toast, showToast,
  };

  return (
    <StoreCtx.Provider value={value}>
      {children}

      {/* Login dialog — shown when a guest tries a member-only action. */}
      {loginPrompt && (
        <div className="modal-overlay" role="presentation" onClick={closeLoginPrompt}>
          <div className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-dialog-title" onClick={(e) => e.stopPropagation()}>
            <button className="hbtn dlg-close" onClick={closeLoginPrompt} aria-label="Close dialog">✕</button>
            <span className="dlg-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <h3 id="login-dialog-title" className="serif">{loginPrompt.title}</h3>
            <p>{loginPrompt.detail}</p>
            <Link className="btn btn-gold" to={`/login?next=${encodeURIComponent(loginPrompt.next || nextParam)}`} onClick={closeLoginPrompt}>Log in</Link>
            <Link className="btn btn-ghost" to={`/register?next=${encodeURIComponent(loginPrompt.next || nextParam)}`} onClick={closeLoginPrompt}>Create account</Link>
            <small>No password? Use a mobile or email OTP — it takes seconds.</small>
          </div>
        </div>
      )}

      {/* Lightweight status toast (added / out of stock / server errors). */}
      {toast && (
        <div className={`toast ${toast.tone === "err" ? "toast-err" : ""}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </StoreCtx.Provider>
  );
}
