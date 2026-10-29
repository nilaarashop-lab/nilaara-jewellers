const mongoose = require("mongoose");

/**
 * Orders keep an immutable snapshot of purchased products and the full server-computed
 * price breakdown. Status follows a controlled workflow (see lib/orderStatus.js).
 */
const STATUSES = ["placed", "packed", "shipped", "delivered", "cancelled", "returned", "refunded"];
const PAYMENT_STATUSES = ["pending", "cod_pending", "paid", "failed", "refunded"];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // reference (may be deleted later)
    productId: String, // legacy storefront id snapshot
    name: String,
    sku: String,
    image: String,
    price: Number, // unit price charged
    mrp: Number,
    qty: { type: Number, min: 1 },
    track: { type: Boolean, default: false }, // inventory was reserved for this line
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // null for guest checkout
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totals: {
      sub: Number,
      mrpDiscount: Number,
      couponOff: Number,
      coupon: { type: String, default: "" },
      shipping: Number,
      tax: Number,
      taxRatePct: Number,
      total: Number,
      count: Number,
    },
    customer: {
      name: String,
      phone: { type: String, match: [/^[0-9]{10}$/, "Phone must be 10 digits"] },
      address: String,
      city: String,
      state: String,
      pin: { type: String, match: [/^[0-9]{6}$/, "Pincode must be 6 digits"] },
      notes: { type: String, maxlength: 300 }, // delivery instructions
    },
    // Snapshot of the chosen delivery option at checkout time.
    shipping: {
      methodId: String,
      label: String,
      fee: Number,
      etaMinDays: Number,
      etaMaxDays: Number,
    },
    payment: {
      method: { type: String, enum: ["cod", "razorpay"], default: "cod" },
      status: { type: String, enum: PAYMENT_STATUSES, default: "pending", index: true },
      razorpayOrderId: { type: String, index: true },
      razorpayPaymentId: String,
      paidAt: Date,
    },
    status: { type: String, enum: STATUSES, default: "placed", index: true },
    statusHistory: [
      {
        _id: false,
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
      },
    ],
    cancel: { reason: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" } },
    ip: String,
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "customer.phone": 1 });

/** Owner-scoped public shape. */
orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderNumber: this.orderNumber,
    items: this.items.map((i) => ({ productId: i.productId, name: i.name, image: i.image, price: i.price, mrp: i.mrp, qty: i.qty })),
    totals: this.totals,
    status: this.status,
    payment: { method: this.payment.method, status: this.payment.status },
    statusHistory: this.statusHistory.map((s) => ({ status: s.status, at: s.at })),
    customer: {
      name: this.customer.name,
      city: this.customer.city,
      state: this.customer.state || "",
      pin: this.customer.pin,
      address: this.customer.address,
      phone: this.customer.phone,
      notes: this.customer.notes || "",
    },
    shipping: this.shipping
      ? { methodId: this.shipping.methodId, label: this.shipping.label, etaMinDays: this.shipping.etaMinDays, etaMaxDays: this.shipping.etaMaxDays }
      : null,
    createdAt: this.createdAt,
    cancel: this.cancel ? { reason: this.cancel.reason, at: this.cancel.at } : null,
  };
};

/** Admin shape. */
orderSchema.methods.toAdmin = function toAdmin() {
  return { ...this.toPublic(), _id: this._id, user: this.user || null, ip: this.ip, payment: this.payment, createdAt: this.createdAt, updatedAt: this.updatedAt };
};

module.exports = mongoose.model("Order", orderSchema);
module.exports.STATUSES = STATUSES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
