/**
 * API client for the Nilaara backend.
 *
 * Modes:
 *  - API configured (VITE_API_URL set)  → all data comes from MongoDB via the API.
 *    If a request FAILS, an error is thrown — the app never silently falls back
 *    to demo data (that would show fake products on a live store).
 *  - No API configured                  → built-in demo catalogue, demo-only auth.
 *    Never stores passwords anywhere.
 *
 * Auth is cookie-based (httpOnly session cookie set by the backend), so every
 * request sends `credentials: "include"`.
 *
 * Origins: a production build calls `/api/*` on its own origin — `vercel.json`
 * proxies that path to the API. The session cookie is then first-party, which is
 * the only kind Safari and iOS browsers accept; a cookie set by another site is
 * dropped there even with SameSite=None. Locally (vite dev) the API is called
 * directly via VITE_API_URL.
 */
import { PRODUCTS } from "../data/products";

const CONFIGURED = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";
const API = CONFIGURED && !import.meta.env.PROD ? CONFIGURED : "";
export const hasAPI = Boolean(CONFIGURED);
/** Google Identity Services is available only when the public client ID is set. */
export const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

let onUnauthorized = null;
/** Called when the backend answers 401/403 on an authenticated request. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function api(path, { method = "GET", body, formData, raw } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      credentials: "include",
      headers: formData ? undefined : body ? { "Content-Type": "application/json" } : undefined,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    // fetch only rejects for transport failures (offline, DNS, CORS, mixed
    // content) — "Failed to fetch" is useless to a shopper.
    const err = new Error("We can't reach Nilaara's servers right now. Check your connection and try again.");
    err.status = 0;
    err.network = true;
    throw err;
  }
  let data = null;
  try {
    data = raw ? await res.text() : await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && onUnauthorized) onUnauthorized(res.status, path);
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    err.body = data; // full error payload (e.g. OTP cooldown: retryAfterSec)
    throw err;
  }
  return data;
}

// ── Local demo-mode helpers (ONLY used when no backend is configured) ──
const readLS = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota */
  }
};

export const getLocalOrders = () => readLS("nilaara-orders", []);
export const saveLocalOrder = (order) => {
  const list = [order, ...readLS("nilaara-orders", [])].slice(0, 200);
  writeLS("nilaara-orders", list);
  return list;
};
export const updateLocalOrder = (id, patch) => {
  const list = readLS("nilaara-orders", []).map((o) => (String(o.id) === String(id) ? { ...o, ...patch } : o));
  writeLS("nilaara-orders", list);
  return list;
};

// ── Products ──

export async function fetchProducts() {
  if (!hasAPI) {
    const ov = readLS("nilaara-admin-products", null); // demo-mode admin edits
    if (!ov) return PRODUCTS;
    const map = new Map(PRODUCTS.map((p) => [p.id, p]));
    for (const p of ov.upsert) map.set(p.id, p);
    for (const id of ov.remove) map.delete(id);
    return [...map.values()];
  }
  const list = await api("/api/products?limit=100"); // throws on failure — no demo fallback
  return list;
}

/** Admin table listing — includes drafts/archived (not just published). */
export async function adminListProducts() {
  if (!hasAPI) return fetchProducts();
  return api("/api/products?admin=1&limit=200");
}

// Fields the storefront search matches — the backend applies the same set.
const searchable = (p) =>
  [p.name, p.plating, p.stones, p.collection, p.category, p.customTag, p.tag, p.badge]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/**
 * Case-insensitive substring match used by the header search and the shop page,
 * so a suggestion always appears in the full results it links to.
 */
export function matchesQuery(p, q) {
  const needle = String(q || "").trim().toLowerCase();
  return !needle || searchable(p).includes(needle);
}

/**
 * Live catalogue search. In API mode the server answers (same fields, literal
 * match) and a failure throws — the header shows "unavailable" rather than
 * inventing products. Demo mode filters the local catalogue.
 */
export async function searchProducts(q, limit = 6) {
  const query = String(q || "").trim();
  if (!query) return [];
  if (!hasAPI) return (await fetchProducts()).filter((p) => matchesQuery(p, query)).slice(0, limit);
  return api(`/api/products?limit=${Number(limit) || 6}&q=${encodeURIComponent(query)}`);
}

export async function fetchProduct(id) {
  if (!hasAPI) return PRODUCTS.find((p) => p.id === id) || null;
  return api(`/api/products/${encodeURIComponent(id)}`);
}

// ── Server-side cart (persistent, per account) ─────────────────
// The server returns items priced from MongoDB; only ids + quantities are
// ever sent by the browser.

/** The signed-in customer's cart from MongoDB (demo mode: localStorage). */
export async function fetchCart() {
  if (!hasAPI) return readLS("nilaara-cart", []);
  return (await api("/api/cart")).items || [];
}

/** Adds (or increments) an item. Throws a displayable error when unavailable/out of stock. */
export async function cartAdd(id, qty = 1) {
  if (!hasAPI) {
    const cart = readLS("nilaara-cart", []);
    const found = cart.find((i) => i.id === id);
    if (found) found.qty += qty;
    else cart.push({ id, qty });
    writeLS("nilaara-cart", cart);
    return cart;
  }
  return (await api("/api/cart/items", { method: "POST", body: { id, qty } })).items || [];
}

/** Merges a guest cart into the account cart right after login. */
export async function cartMerge(items) {
  if (!hasAPI) return readLS("nilaara-cart", []);
  return (await api("/api/cart/merge", { method: "POST", body: { items } })).items || [];
}

/** Sets a quantity (0 removes). Rejects quantities above available stock. */
export async function cartSetQty(id, qty) {
  if (!hasAPI) {
    const cart = readLS("nilaara-cart", []).map((i) => (i.id === id ? { ...i, qty } : i)).filter((i) => i.qty > 0);
    writeLS("nilaara-cart", cart);
    return cart;
  }
  return (await api(`/api/cart/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { qty } })).items || [];
}

export async function cartRemove(id) {
  if (!hasAPI) {
    const cart = readLS("nilaara-cart", []).filter((i) => i.id !== id);
    writeLS("nilaara-cart", cart);
    return cart;
  }
  return (await api(`/api/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" })).items || [];
}

export async function cartClear() {
  if (!hasAPI) {
    writeLS("nilaara-cart", []);
    return [];
  }
  return (await api("/api/cart", { method: "DELETE" })).items || [];
}

// ── Storefront settings (delivery methods, payment availability) ──

/**
 * Public settings. The checkout UI shows delivery fees/ETAs ONLY from this
 * configured data — nothing is hardcoded in the browser beyond a plain
 * standard-delivery fallback for demo mode. Also carries the announcement
 * marquee lines and homepage hero/card/festive content for the home page.
 */
export async function fetchSettings() {
  if (!hasAPI) {
    return { shipping: { freeOver: 999, fee: 79, methods: [] }, payments: { cod: true, razorpay: false } };
  }
  return api("/api/settings");
}

/** Full editable settings document — admin/staff sessions only. */
export async function adminFetchSettings() {
  if (!hasAPI) throw new Error("Homepage editing needs the backend (set VITE_API_URL).");
  return api("/api/settings/admin");
}

/**
 * Saves announcement/marquee + homepage content (hero slides, promo cards,
 * festive banner). Server-validated: images must come from the upload endpoint
 * or an approved host. Returns the updated PUBLIC settings shape.
 */
export async function adminSaveSettings(patch) {
  if (!hasAPI) throw new Error("Homepage editing needs the backend (set VITE_API_URL).");
  return api("/api/settings", { method: "PATCH", body: patch });
}

// ── Promo codes (admin-managed; validated at checkout) ──

/** Active promo codes shown on the storefront (bag/checkout chips). */
export async function fetchActivePromos() {
  if (!hasAPI) return [];
  return api("/api/promos/active");
}

/** Admin list incl. usage counters. */
export async function adminListPromos() {
  if (!hasAPI) return [];
  return api("/api/promos");
}

/** Creates a promo code (409 → already exists). */
export async function adminCreatePromo(body) {
  if (!hasAPI) throw new Error("Promo codes need the backend (set VITE_API_URL).");
  return api("/api/promos", { method: "POST", body });
}

/** Edits percent/minimum/active/maxUses (the code itself is immutable). */
export async function adminUpdatePromo(code, patch) {
  if (!hasAPI) throw new Error("Promo codes need the backend (set VITE_API_URL).");
  return api(`/api/promos/${encodeURIComponent(code)}`, { method: "PATCH", body: patch });
}

export async function adminDeletePromo(code) {
  if (!hasAPI) throw new Error("Promo codes need the backend (set VITE_API_URL).");
  return api(`/api/promos/${encodeURIComponent(code)}`, { method: "DELETE" });
}

// ── Pending action (preserves intent across the login redirect) ──

const PENDING_KEY = "nilaara-pending-action";
/** Saves what the visitor wanted to do before being asked to log in. */
export const setPendingIntent = (intent) => writeLS(PENDING_KEY, intent);
export const peekPendingIntent = () => readLS(PENDING_KEY, null);
export const clearPendingIntent = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
};

// ── Checkout / orders ──

/**
 * Places an order. The backend RECOMPUTES prices from its own records — the
 * returned order contains the authoritative totals.
 */
export async function createOrder(payload) {
  if (!hasAPI) {
    await new Promise((r) => setTimeout(r, 600));
    const order = { id: "NIL" + Date.now().toString().slice(-8), ...payload, mode: "COD-stub", createdAt: new Date().toISOString() };
    saveLocalOrder(order);
    return order;
  }
  const order = await api("/api/orders", { method: "POST", body: payload });
  saveLocalOrder(order);
  return order;
}

/**
 * Server-side recalculation of the current basket (no order is created).
 * Returns null in demo mode, where the browser has no pricing engine to ask.
 */
export async function previewOrder({ items, coupon, shippingMethod }) {
  if (!hasAPI) return null;
  return api("/api/orders/preview", { method: "POST", body: { items, coupon, shippingMethod } });
}

export async function fetchOrder(id, phone) {
  if (!hasAPI) return getLocalOrders().find((o) => String(o.id) === String(id)) || null;
  return api(`/api/orders/${encodeURIComponent(id)}${phone ? `?phone=${encodeURIComponent(phone)}` : ""}`);
}

// ── Admin: uploads, products, orders, stats ──

/**
 * Uploads product images to the backend, which streams them to ImageKit.
 * Returns [{url, publicId, alt}]. Throws with a clear message on failure.
 */
export async function adminUploadImages(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 6);
  if (!list.length) throw new Error("Choose an image file (JPG/PNG/WebP).");
  if (!hasAPI) {
    // Demo mode only: compress into inline data-URLs so the demo persists without a server.
    return Promise.all(list.map((f) => fileToResizedDataURL(f).then((url) => ({ url, publicId: "", alt: "" }))));
  }
  const fd = new FormData();
  list.forEach((f) => fd.append("photos", f));
  const j = await api("/api/upload", { method: "POST", formData: fd });
  return j.images;
}

function fileToResizedDataURL(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image — try a JPG or PNG."));
    };
    img.src = url;
  });
}

export async function adminListOrders() {
  if (!hasAPI) return getLocalOrders();
  return api("/api/orders?limit=200");
}

export async function adminUpdateOrderStatus(id, status, note) {
  if (!hasAPI) {
    updateLocalOrder(id, { status });
    return { ok: true };
  }
  const order = await api(`/api/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status, note } });
  updateLocalOrder(id, { status: order.status });
  return order;
}

export async function adminSaveProduct(p) {
  if (!hasAPI) {
    const ov = readLS("nilaara-admin-products", { upsert: [], remove: [] });
    ov.upsert = [p, ...ov.upsert.filter((x) => x.id !== p.id)];
    ov.remove = ov.remove.filter((id) => id !== p.id);
    writeLS("nilaara-admin-products", ov);
    return p;
  }
  const body = {
    ...p,
    price: +p.price,
    mrp: p.mrp === "" || p.mrp == null ? undefined : +p.mrp,
    stock: p.stock === "" || p.stock == null ? undefined : +p.stock,
    images: (p.images || []).map((i) => (typeof i === "string" ? { url: i, publicId: "", alt: "" } : i)),
  };
  if (p._id) return api(`/api/products/${encodeURIComponent(p.id || p._id)}`, { method: "PUT", body: body });
  try {
    return await api("/api/products", { method: "POST", body: body });
  } catch (e) {
    if (e.status === 409 || e.status === 400) throw e;
    // Fall back to update when the id already exists on the server.
    return api(`/api/products/${encodeURIComponent(p.id)}`, { method: "PUT", body: body });
  }
}

export async function adminDeleteProduct(id) {
  if (!hasAPI) {
    const ov = readLS("nilaara-admin-products", { upsert: [], remove: [] });
    ov.upsert = ov.upsert.filter((x) => x.id !== id);
    if (PRODUCTS.some((p) => p.id === id)) ov.remove.push(id);
    writeLS("nilaara-admin-products", ov);
    return { ok: true };
  }
  return api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function adminStats() {
  if (!hasAPI) {
    const orders = getLocalOrders();
    const revenue = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (o.totals?.total || 0), 0);
    const byStatus = orders.reduce((m, o) => ((m[o.status || "placed"] = (m[o.status || "placed"] || 0) + 1), m), {});
    return { products: PRODUCTS.length, orders: orders.length, revenue, byStatus };
  }
  return api("/api/stats");
}

// ── Auth (cookie sessions; no tokens or passwords in browser storage) ──

export async function authLogin({ id, password }) {
  if (!hasAPI) {
    await new Promise((r) => setTimeout(r, 400));
    return { user: { id: "demo-" + Date.now(), name: "Demo User", email: id, role: "customer", provider: "demo" } };
  }
  return api("/api/auth/login", { method: "POST", body: { id, password } });
}

export async function authRegister(payload) {
  if (!hasAPI) {
    await new Promise((r) => setTimeout(r, 400));
    return { user: { id: "demo-" + Date.now(), name: payload.name, email: payload.email || null, phone: payload.phone || null, role: "customer", provider: "demo" } };
  }
  return api("/api/auth/register", { method: "POST", body: payload });
}

export async function authLogout() {
  if (!hasAPI) return { ok: true };
  return api("/api/auth/logout", { method: "POST" });
}

export async function authMe() {
  if (!hasAPI) return null;
  try {
    return (await api("/api/auth/me")).user;
  } catch {
    return null;
  }
}

/** Google Identity Services: exchanges the ID token for a Nilaara session. */
export async function authGoogle(credential) {
  if (!hasAPI) throw new Error("Google sign-in needs the backend (set VITE_API_URL).");
  return api("/api/auth/google", { method: "POST", body: { credential } });
}

/** Links Google to the account of the CURRENT session (from the account page). */
export async function linkGoogle(credential) {
  if (!hasAPI) throw new Error("Google linking needs the backend (set VITE_API_URL).");
  return api("/api/auth/google/link", { method: "POST", body: { credential } });
}

/** Step 1 of mobile OTP login — the server texts the code; it is never returned. */
export async function otpRequest(phone) {
  if (!hasAPI) throw new Error("OTP login needs the backend (set VITE_API_URL).");
  return api("/api/auth/otp/request", { method: "POST", body: { phone } });
}

/** Step 2 — verifies the code server-side and starts a session. */
export async function otpVerify(phone, otp) {
  if (!hasAPI) throw new Error("OTP login needs the backend (set VITE_API_URL).");
  return api("/api/auth/otp/verify", { method: "POST", body: { phone, otp } });
}

/** Step 1 of EMAIL OTP login (Resend) — the server emails the code; never returned. */
export async function emailOtpRequest(email) {
  if (!hasAPI) throw new Error("Email verification needs the backend (set VITE_API_URL).");
  return api("/api/auth/email/otp/request", { method: "POST", body: { email } });
}

/** Step 2 — verifies the emailed code server-side and starts a session. */
export async function emailOtpVerify(email, otp) {
  if (!hasAPI) throw new Error("Email verification needs the backend (set VITE_API_URL).");
  return api("/api/auth/email/otp/verify", { method: "POST", body: { email, otp } });
}

/** Updates the signed-in customer's profile. */
export async function updateMe(patch) {
  if (!hasAPI) throw new Error("Profiles need the backend (set VITE_API_URL).");
  return api("/api/auth/me", { method: "PATCH", body: patch });
}

/**
 * The signed-in customer's own order history (server-scoped to the session).
 * @param {"live"|"old"|""} view  live = placed/packed/shipped, old = finished/cancelled
 */
export async function fetchMyOrders(view = "") {
  if (!hasAPI) {
    const LIVE = ["placed", "packed", "shipped"];
    const list = getLocalOrders();
    if (view === "live") return list.filter((o) => LIVE.includes(o.status || "placed"));
    if (view === "old") return list.filter((o) => !LIVE.includes(o.status || "placed"));
    return list;
  }
  return api(`/api/orders/mine${view ? `?view=${encodeURIComponent(view)}` : ""}`);
}

// ── Razorpay (server-mediated; amounts & status always decided server-side) ──

/**
 * Creates the Razorpay provider order for a shop order the customer owns.
 * The amount is the SERVER-computed total — never a browser value.
 */
export async function createRazorpayOrder(orderNumber) {
  if (!hasAPI) throw new Error("Online payments need the backend (set VITE_API_URL).");
  return api(`/api/payments/${encodeURIComponent(orderNumber)}/order`, { method: "POST" });
}

/**
 * Submits the Razorpay checkout signature for SERVER verification.
 * The order only becomes "paid" if the HMAC signature validates.
 */
export async function verifyRazorpayPayment(orderNumber, payload) {
  if (!hasAPI) throw new Error("Online payments need the backend (set VITE_API_URL).");
  return api(`/api/payments/${encodeURIComponent(orderNumber)}/verify`, { method: "POST", body: payload });
}

/** Loads the official Razorpay checkout script on demand (only when configured). */
export function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => reject(new Error("Could not load the secure payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}
