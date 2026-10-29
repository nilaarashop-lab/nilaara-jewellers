const mongoose = require("mongoose");

/**
 * One document per checkout attempt against the payment provider.
 * Idempotency: unique indexes on provider ids; webhook events are de-duplicated by eventId.
 */
const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "authorized", "captured", "failed", "refunded", "expired"], default: "created", index: true },
    failureReason: String,
    refund: { id: String, amountPaise: Number, status: String, at: Date },
    events: [{ _id: false, eventId: String, type: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

/** Returns true only the first time an event id is seen (webhook idempotency). */
paymentSchema.methods.recordEvent = function recordEvent(eventId, type) {
  if (eventId && this.events.some((e) => e.eventId === eventId)) return false;
  this.events.push({ eventId, type });
  return true;
};

module.exports = mongoose.model("Payment", paymentSchema);
