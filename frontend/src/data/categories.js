import { img } from "./images.js";

/**
 * Built-in categories: name plus the tile picture used when the admin has not
 * uploaded one. Products may carry any other category — the storefront list is
 * built from the catalogue, so a new one appears without a code change.
 */
export const BASE_CATEGORIES = [
  { slug: "jewellery-sets", name: "Jewellery Sets", img: img("photo-1599643478518-a784e5dc4c8f", 400) },
  { slug: "necklaces", name: "Necklaces", img: img("photo-1601121141461-9d6647bca1ed", 400) },
  { slug: "earrings", name: "Earrings", img: img("photo-1573408301185-9146fe634ad0", 400) },
  { slug: "jhumkas", name: "Jhumkas", img: img("photo-1617038220319-276d3cfab638", 400) },
  { slug: "bangles", name: "Bangles", img: img("photo-1611591437281-460bfbe1220a", 400) },
  { slug: "rings", name: "Rings", img: img("photo-1605100804763-247f67b3557e", 400) },
];

/** Any admin-typed name becomes the lowercase, dash-separated slug used in URLs. */
export const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** "bangles-kundan" -> "Bangles Kundan"; built-ins keep their exact spelling. */
export const categoryLabel = (value) => {
  const slug = slugify(value);
  if (!slug) return "";
  return (
    BASE_CATEGORIES.find((c) => c.slug === slug)?.name ||
    slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  );
};

/**
 * Every category the catalogue uses, built-in order first then alphabetically,
 * each with a picture: admin upload, built-in art, or the first product photo so
 * a brand-new category never shows an empty tile. Categories with no published
 * products are left out rather than linked to a page of zero designs.
 */
export const listCategories = (products = [], tiles = []) => {
  const tileBySlug = new Map((tiles || []).map((t) => [t.slug, t]));
  const builtIn = new Map(BASE_CATEGORIES.map((c) => [c.slug, c]));
  const order = new Map(BASE_CATEGORIES.map((c, i) => [c.slug, i]));
  const bySlug = new Map();
  for (const p of products || []) {
    const slug = slugify(p.category);
    if (!slug || bySlug.has(slug)) continue;
    const known = builtIn.get(slug);
    bySlug.set(slug, {
      slug,
      name: categoryLabel(slug),
      img: known?.img || p.images?.[0] || "",
      alt: "",
    });
  }
  return [...bySlug.values()]
    .map((c) => {
      const tile = tileBySlug.get(c.slug);
      return { ...c, img: tile?.url || c.img, alt: tile?.alt || c.alt };
    })
    .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99) || a.name.localeCompare(b.name));
};
