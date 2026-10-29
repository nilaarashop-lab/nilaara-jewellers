const mongoose = require("mongoose");

/**
 * Server-side shopping cart, one per user account.
 * Items store ONLY the product identifier and quantity — name, price and image
 * are always resolved from the current Product records at read time, so a cart
 * can never carry stale or forged prices.
 */
const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true }, // storefront id (legacy "par-…" or "nilaara-…")
    qty: { type: Number, required: true, min: 1, max: 10, default: 1 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

/** Raw stored items (ids + qty only — no prices). */
cartSchema.methods.toStored = function toStored() {
  return this.items.map((i) => ({ id: i.productId, qty: i.qty }));
};

module.exports = mongoose.model("Cart", cartSchema);
