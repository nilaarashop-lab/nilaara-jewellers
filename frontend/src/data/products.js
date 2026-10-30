import catalogue from "../content/products.json";
import { mediaUrl } from "./repo.js";
import { img } from "./images.js";

/** Published products from the Git-managed catalogue (frontend/src/content/products.json). */
const normalizeProduct = (p, commit = "") => ({
  ...p,
  id: String(p.id || p.slug || ""),
  price: Number(p.price) || 0,
  mrp: Number(p.mrp) || 0,
  stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
  trackInventory: p.trackInventory !== false,
  images: Array.isArray(p.images)
    ? p.images.filter(Boolean).map((url) => mediaUrl(url, commit))
    : [],
  inStock: p.trackInventory === false ? true : Number(p.stock) > 0,
});

export const normalizeProducts = (list, commit = "") =>
  (Array.isArray(list) ? list : [])
    .filter((p) => p && p.status === "published")
    .map((p) => normalizeProduct(p, commit));

export const PRODUCTS = normalizeProducts(catalogue.products);

export const HERO_IMG = img("photo-1611652022419-a9419f74343d", 1200);
export const SIDE_IMGS = [
  img("photo-1599643478518-a784e5dc4c8f", 600),
  img("photo-1515562141207-7a88fb7ce338", 600),
];
export const FESTIVE_IMG = img("photo-1584302179602-e4c3d3fd629d", 900);

export const formatINR = (n) => "₹" + Number(n).toLocaleString("en-IN");

/**
 * Discount percentage vs MRP. Returns 0 when there is no genuine markdown
 * (missing/zero MRP, or MRP not above the selling price) so the UI never shows
 * "NaN% off", "-Infinity% off" or a negative discount.
 */
export const discountPercent = (price, mrp) => {
  const p = Number(price);
  const m = Number(mrp);
  return Number.isFinite(p) && Number.isFinite(m) && m > p && p >= 0
    ? Math.round((1 - p / m) * 100)
    : 0;
};
