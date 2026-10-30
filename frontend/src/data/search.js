/**
 * What a shopper can type to find a piece: name, category, admin tag, and the
 * product ID (so "w2000" or "2000" finds it — staff share IDs on WhatsApp).
 */
const searchable = (product) =>
  [product?.name, product?.id, product?.slug, product?.category, product?.customTag]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Case-insensitive substring match shared by the shop page and header search. */
export function matchesQuery(product, q) {
  const needle = String(q || "").trim().toLowerCase();
  return !needle || searchable(product).includes(needle);
}
