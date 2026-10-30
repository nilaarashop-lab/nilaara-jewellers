/**
 * Catalogue helpers for the static storefront.
 *
 * Products are committed as JSON and refreshed at runtime, with the bundled
 * copy as an offline fallback. Browsing and search work without an API, a
 * database, or a server that can sleep. Staff edits happen through the
 * GitHub-backed admin at /admin.
 */
import { PRODUCTS } from "../data/products";
import { matchesQuery } from "../data/search.js";

export { matchesQuery };

export async function searchProducts(q, limit = 6, products = PRODUCTS) {
  const query = String(q || "").trim();
  if (!query) return [];
  return products.filter((p) => matchesQuery(p, query)).slice(0, limit);
}
