/**
 * Shared storefront catalogue resolution: given user-supplied identifiers
 * (storefront id, slug or ObjectId), return the published product records.
 * Used by the cart routes; prices are ALWAYS taken from these records.
 */
const mongoose = require("mongoose");
const Product = require("../models/Product");

const isOid = (s) => mongoose.Types.ObjectId.isValid(String(s));

/** @returns {Promise<Map<string, object>>} keyed by id, slug and _id (lean docs) */
async function findStorefrontProducts(ids) {
  const clean = [...new Set(ids.map(String))];
  if (!clean.length) return new Map();
  const docs = await Product.find({
    $and: [
      { $or: [{ id: { $in: clean } }, { slug: { $in: clean } }, { _id: { $in: clean.filter(isOid) } }] },
      { $or: [{ status: "published" }, { status: { $exists: false } }] },
    ],
  }).lean();
  const byKey = new Map();
  for (const d of docs) {
    byKey.set(String(d.id), d);
    if (d.slug) byKey.set(String(d.slug), d);
    byKey.set(String(d._id), d);
  }
  return byKey;
}

/** True when this record tracks stock and the given qty exceeds it. */
function overStock(doc, qty) {
  return doc.trackInventory !== false && typeof doc.stock === "number" && qty > doc.stock;
}

/** Stock cap for ordering/adding: tracked → stock (min 0); untracked → max qty. */
function stockCap(doc) {
  if (doc.trackInventory === false || typeof doc.stock !== "number") return 10;
  return Math.max(0, Math.min(10, doc.stock));
}

module.exports = { findStorefrontProducts, overStock, stockCap, isOid };
