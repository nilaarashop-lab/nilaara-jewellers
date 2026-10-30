import catalogue from "../content/products.json";
import { mediaUrl } from "./repo.js";

const img = (id, w = 800) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

export const CATEGORIES = [
  { slug: "jewellery-sets", name: "Jewellery Sets", img: img("photo-1599643478518-a784e5dc4c8f", 400), count: "300+ styles" },
  { slug: "necklaces", name: "Necklaces", img: img("photo-1601121141461-9d6647bca1ed", 400), count: "194 styles" },
  { slug: "earrings", name: "Earrings", img: img("photo-1573408301185-9146fe634ad0", 400), count: "320+ styles" },
  { slug: "jhumkas", name: "Jhumkas", img: img("photo-1617038220319-276d3cfab638", 400), count: "140 styles" },
  { slug: "bangles", name: "Bangles", img: img("photo-1611591437281-460bfbe1220a", 400), count: "210 styles" },
  { slug: "rings", name: "Rings", img: img("photo-1605100804763-247f67b3557e", 400), count: "180 styles" },
];

export const COLLECTIONS = [
  { slug: "gold-plated", name: "Gold Plated", img: img("photo-1611652022419-a9419f74343d", 600) },
  { slug: "american-diamond", name: "American Diamond", img: img("photo-1515562141207-7a88fb7ce338", 600) },
  { slug: "kundan", name: "Kundan", img: img("photo-1584302179602-e4c3d3fd629d", 600) },
  { slug: "temple", name: "Temple", img: img("photo-1602173574767-37ac01994b2a", 600) },
  { slug: "oxidised", name: "Oxidised", img: img("photo-1610694955371-d4a3e0ce4b52", 600) },
  { slug: "pearl", name: "Pearl & Beaded", img: img("photo-1599643477877-530eb83abc8e", 600) },
];

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
