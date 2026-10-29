const mongoose = require("mongoose");

/**
 * Admin-managed promo codes. Percent-off on the whole subtotal above an
 * optional minimum. Codes are validated at checkout (order/preview routes),
 * which also enforces maxUses; this model never stores anything sensitive.
 */
const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    percent: { type: Number, required: true, min: 1, max: 90 },
    minSubtotal: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    maxUses: { type: Number, default: null, min: 1 }, // null = unlimited
    timesUsed: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "", maxlength: 120 },
  },
  { timestamps: true }
);

/** Whether this code can still be applied to an order of the given subtotal. */
promoCodeSchema.methods.isUsable = function isUsable(subtotal) {
  if (!this.active) return false;
  if (subtotal < Number(this.minSubtotal || 0)) return false;
  if (this.maxUses != null && this.timesUsed >= this.maxUses) return false;
  return true;
};

/** Public, storefront-safe subset (no usage counters). */
promoCodeSchema.methods.toPublic = function toPublic() {
  return {
    code: this.code,
    percent: this.percent,
    minSubtotal: this.minSubtotal || 0,
    description: this.description || "",
  };
};

module.exports = mongoose.model("PromoCode", promoCodeSchema);
