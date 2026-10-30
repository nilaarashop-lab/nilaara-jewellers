/**
 * Product IDs are the code a shopper sends on WhatsApp and the slug of the
 * product page, so one ID can only ever belong to one piece.
 */

export const normalizeId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Returns the ID a product would be saved under when `candidate` already
 * belongs to another product, or "" when it is free.
 *
 * `ownId` is the product being edited, which is allowed to keep its own ID;
 * both sides are normalised so "W2000" and " w2000 " count as the same ID.
 * A record with no ID resolves through its slug, exactly like the storefront.
 */
export const findIdClash = (products = [], candidate, ownId = "") => {
  const id = normalizeId(candidate);
  if (!id) return "";
  const mine = normalizeId(ownId);
  const takenBy = (p) => normalizeId(p?.id || p?.slug);
  return products.some((p) => takenBy(p) === id && takenBy(p) !== mine) ? id : "";
};
