/**
 * Catalogue helpers for the static storefront.
 *
 * Products are committed as JSON and refreshed at runtime, with the bundled
 * copy as an offline fallback. Browsing and search work without an API, a
 * database, or a server that can sleep. Staff edits happen through the
 * GitHub-backed admin at /admin.
 */
import { PRODUCTS } from "../data/products";

const searchable = (p) =>
  [p.name, p.plating, p.stones, p.collection, p.category, p.customTag, p.tag, p.badge]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Case-insensitive substring match shared by the shop page and header search. */
export function matchesQuery(p, q) {
  const needle = String(q || "").trim().toLowerCase();
  return !needle || searchable(p).includes(needle);
}

export async function searchProducts(q, limit = 6, products = PRODUCTS) {
  const query = String(q || "").trim();
  if (!query) return [];
  return products.filter((p) => matchesQuery(p, query)).slice(0, limit);
}
