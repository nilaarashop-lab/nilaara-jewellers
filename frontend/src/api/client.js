/**
 * API client for the Nilaara backend.
 *
 * The storefront is a catalogue: products, homepage settings and the wishlist
 * are all it needs. Orders happen in WhatsApp, so there is no customer auth,
 * cart, checkout or payment code on the browser any more.
 *
 * Modes:
 *  - API configured (VITE_API_URL set)  → products/settings come from MongoDB.
 *    If a request FAILS, an error is thrown — the app never silently falls back
 *    to demo data (that would show fake products on a live store).
 *  - No API configured                  → built-in demo catalogue.
 *
 * The admin panel keeps using the cookie session (httpOnly) and the admin-only
 * endpoints below, so every request sends `credentials: "include"`.
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

/** Demo-mode orders (the admin panel can still show them without a backend). */
export const getLocalOrders = () => readLS("nilaara-orders", []);
export const updateLocalOrder = (id, patch) => {
  const list = readLS("nilaara-orders", []).map((o) => (String(o.id) === String(id) ? { ...o, ...patch } : o));
  writeLS("nilaara-orders", list);
  return list;
};

// ── Products ──

/**
 * Last catalogue fetched from the API. A cold/sleeping Render instance should
 * not blank the storefront for a returning visitor, so a recent copy is used
 * only when the live request fails. Admin screens always hit the API directly.
 */
const PRODUCTS_CACHE_KEY = "nilaara-products-v1";
const PRODUCTS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const readCachedProducts = () => {
  const entry = readLS(PRODUCTS_CACHE_KEY, null);
  if (!entry || !Array.isArray(entry.items) || !entry.savedAt) return null;
  if (Date.now() - entry.savedAt > PRODUCTS_CACHE_TTL) return null;
  return entry.items;
};

export async function fetchProducts() {
  if (!hasAPI) {
    const ov = readLS("nilaara-admin-products", null); // demo-mode admin edits
    if (!ov) return PRODUCTS;
    const map = new Map(PRODUCTS.map((p) => [p.id, p]));
    for (const p of ov.upsert) map.set(p.id, p);
    for (const id of ov.remove) map.delete(id);
    return [...map.values()];
  }
  try {
    const list = await api("/api/products?limit=100");
    if (Array.isArray(list) && list.length) {
      writeLS(PRODUCTS_CACHE_KEY, { savedAt: Date.now(), items: list });
    }
    return list;
  } catch (err) {
    const cached = readCachedProducts();
    if (cached) return cached;
    throw err; // no cache → surface the real error, never invent products
  }
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
  try {
    return await api(`/api/products?limit=${Number(limit) || 6}&q=${encodeURIComponent(query)}`);
  } catch (err) {
    // Keep suggestions working from the cached catalogue while a cold backend
    // boots; the full shop page and product pages use the same cache.
    const cached = readCachedProducts();
    if (cached) return cached.filter((p) => matchesQuery(p, query)).slice(0, limit);
    throw err;
  }
}

// ── Storefront settings (announcement bar, homepage content) ──

/**
 * Public settings. Carries the announcement marquee lines and homepage
 * hero/card/festive content for the home page.
 */
export async function fetchSettings() {
  if (!hasAPI) {
    return { shipping: { freeOver: 999, fee: 79, methods: [] }, payments: { cod: false, razorpay: false } };
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

// ── Promo codes (admin-managed; legacy records may still exist) ──

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

export async function adminSaveProduct(p, prevId) {
  if (!hasAPI) {
    const id = p.id || prevId || `nilaara-${Date.now().toString(36)}`;
    const saved = { ...p, id };
    const ov = readLS("nilaara-admin-products", { upsert: [], remove: [] });
    // Drop any earlier copy under the new id AND the old id (renames), so the
    // demo catalogue doesn't end up with a duplicate of the same product.
    ov.upsert = [saved, ...ov.upsert.filter((x) => x.id !== id && x.id !== prevId)];
    ov.remove = ov.remove.filter((x) => x !== id);
    // A renamed built-in product must retire its old catalogue entry too.
    if (prevId && prevId !== id && PRODUCTS.some((x) => x.id === prevId) && !ov.remove.includes(prevId)) {
      ov.remove.push(prevId);
    }
    writeLS("nilaara-admin-products", ov);
    return saved;
  }
  const body = {
    ...p,
    price: +p.price,
    mrp: p.mrp === "" || p.mrp == null ? undefined : +p.mrp,
    stock: p.stock === "" || p.stock == null ? undefined : +p.stock,
    images: (p.images || []).map((i) => (typeof i === "string" ? { url: i, publicId: "", alt: "" } : i)),
  };
  // Look the product up by Mongo _id when editing, so changing the visible
  // product ID (which is also the URL) still updates the right record.
  if (p._id) return api(`/api/products/${encodeURIComponent(p._id)}`, { method: "PUT", body: body });
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

// ── Staff auth (cookie sessions; no tokens or passwords in browser storage) ──

export async function authLogin({ id, password }) {
  if (!hasAPI) {
    await new Promise((r) => setTimeout(r, 400));
    return { user: { id: "demo-" + Date.now(), name: "Demo Admin", email: id, role: "admin", provider: "demo" } };
  }
  return api("/api/auth/login", { method: "POST", body: { id, password } });
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
