import { img } from "./images.js";

/**
 * The shop's sections, in the order the menu shows them. Each carries the tile
 * picture used until a design in that section — or the admin — supplies one, so
 * a section reads in the menu before its first product is published. A product
 * typed with any other category is added to the list too, nothing gets lost.
 */
export const BASE_CATEGORIES = [
  { slug: "temple-jewellery", name: "Temple Jewellery", img: img("photo-1617038220319-276d3cfab638", 400) },
  { slug: "non-idol-design", name: "Non-Idol Design", img: img("photo-1584302179602-e4c3d3fd629d", 400) },
  { slug: "white-stone", name: "White Stone", img: img("photo-1611652022419-a9419f74343d", 400) },
  { slug: "diamond-replica", name: "Diamond Replica", img: img("photo-1515562141207-7a88fb7ce338", 400) },
  { slug: "ring-necklace", name: "Ring Necklace", img: img("photo-1601121141461-9d6647bca1ed", 400) },
  { slug: "choker", name: "Choker", img: img("photo-1599643478518-a784e5dc4c8f", 400) },
  { slug: "earrings", name: "Earrings", img: img("photo-1573408301185-9146fe634ad0", 400) },
  { slug: "bracelet", name: "Bracelet", img: img("photo-1611591437281-460bfbe1220a", 400) },
  { slug: "bangles", name: "Bangles", img: img("photo-1611591437281-460bfbe1220a", 400) },
  { slug: "rings", name: "Rings", img: img("photo-1605100804763-247f67b3557e", 400) },
  { slug: "long-necklace", name: "Long Necklace", img: img("photo-1601121141461-9d6647bca1ed", 400) },
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
 * The sections to show, built-in order first then alphabetically, each with a
 * picture: the admin's upload, else the first photo of a design in that section,
 * else the built-in art — so no tile is ever blank.
 */
export const listCategories = (products = [], tiles = []) => {
  const tileBySlug = new Map((tiles || []).map((t) => [t.slug, t]));
  const builtIn = new Map(BASE_CATEGORIES.map((c) => [c.slug, c]));
  const order = new Map(BASE_CATEGORIES.map((c, i) => [c.slug, i]));
  const used = [];
  const photoBySlug = new Map();
  for (const p of products || []) {
    const slug = slugify(p.category);
    if (!slug) continue;
    if (!used.includes(slug)) used.push(slug);
    if (p.images?.[0] && !photoBySlug.has(slug)) photoBySlug.set(slug, p.images[0]);
  }
  const extra = used.filter((slug) => !builtIn.has(slug));
  return [...BASE_CATEGORIES.map((c) => c.slug), ...extra]
    .map((slug) => {
      const known = builtIn.get(slug);
      const tile = tileBySlug.get(slug);
      return {
        slug,
        name: known?.name || categoryLabel(slug),
        img: tile?.url || photoBySlug.get(slug) || known?.img || "",
        alt: tile?.alt || "",
      };
    })
    .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99) || a.name.localeCompare(b.name));
};
