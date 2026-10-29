/**
 * Payment routes (Razorpay).
 *
 * Design:
 *  - Provider orders are always created for an EXISTING shop order, using the
 *    SERVER-COMPUTED total (the browser can never choose the amount).
 *  - The order is only marked "paid" after a verified HMAC signature (checkout
 *    verify call or a verified webhook). The webhook path is idempotent.
 *  - Everything returns 503 until RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 *    RAZORPAY_WEBHOOK_SECRET are configured — no fake success responses.
 */
const express = require("express");
const z = require("zod");
const mongoose = require("mongoose");
const env = require("../config/env");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { validate } = require("../middleware/validate");
const { requireUser } = require("../middleware/auth");
const { asyncHandler, fail } = require("../lib/apiError");
const razorpay = require("../services/razorpay");
const { audit } = require("../lib/audit");

const router = express.Router();
const isOid = (s) => mongoose.Types.ObjectId.isValid(s);

const requirePayments = (req, _res, next) => {
  if (!env.paymentsEnabled()) return next(Object.assign(new Error("Online payments are not configured yet — please use Cash on Delivery."), { status: 503 }));
  next();
};

// POST /api/payments/:orderNumber/order — create provider order for a shop order the caller owns
router.post(
  "/:orderNumber/order",
  requirePayments,
  requireUser,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber) });
    if (!order) fail(404, "Order not found.");
    if (String(order.user || "") !== String(req.user._id)) fail(403, "This order does not belong to you.");
    if (order.payment.status === "paid") fail(409, "This order is already paid.");
    if (order.payment.method !== "razorpay") fail(400, "This order was placed with Cash on Delivery.");

    const providerOrder = await razorpay.createProviderOrder({ amountTotal: order.totals.total, orderNumber: order.orderNumber, orderId: order._id });
    order.payment.razorpayOrderId = providerOrder.id;
    await order.save();
    await Payment.findOneAndUpdate(
      { razorpayOrderId: providerOrder.id },
      { $setOnInsert: { order: order._id, user: req.user._id, provider: "razorpay", razorpayOrderId: providerOrder.id, amountPaise: providerOrder.amount, status: "created" } },
      { upsert: true }
    );
    res.json({ keyId: providerOrder.keyId, orderId: providerOrder.id, amountPaise: providerOrder.amount, currency: providerOrder.currency, shopOrderNumber: order.orderNumber });
  })
);

// POST /api/payments/:orderNumber/verify — verify the checkout signature server-side
router.post(
  "/:orderNumber/verify",
  requirePayments,
  validate(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    })
  ),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay.verifyPaymentSignature({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, signature: razorpay_signature })) {
      await Payment.updateOne({ razorpayOrderId: razorpay_order_id }, { $set: { status: "failed", failureReason: "signature mismatch" } });
      fail(400, "Payment verification failed.");
    }
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { $set: { razorpayPaymentId: razorpay_payment_id, status: "captured" } },
      { new: true }
    );
    if (!payment) fail(404, "Payment record not found.");
    const order = await Order.findById(payment.order);
    if (order && order.payment.status !== "paid") {
      order.payment.status = "paid";
      order.payment.razorpayPaymentId = razorpay_payment_id;
      order.payment.paidAt = new Date();
      await order.save();
      await audit(req, "payment.captured", { type: "order", id: String(order._id) }, { via: "verify" });
    }
    res.json({ ok: true, orderNumber: order?.orderNumber });
  })
);

// POST /api/payments/razorpay/webhook — verified, idempotent event handling (raw body)
router.post(
  "/razorpay/webhook",
  requirePayments,
  asyncHandler(async (req, res) => {
    const signature = req.get("x-razorpay-signature");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!razorpay.verifyWebhookSignature(raw, signature)) fail(400, "Invalid webhook signature.");

    const event = JSON.parse(raw.toString("utf8"));
    const entity = event?.payload?.payment?.entity;
    if (entity) {
      const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
      if (payment && payment.recordEvent(event.id, event.event)) {
        // First time this event id is seen → apply it. Repeats are acknowledged only.
        payment.razorpayPaymentId = entity.id;
        if (event.event === "payment.captured") payment.status = "captured";
        if (event.event === "payment.failed") {
          payment.status = "failed";
          payment.failureReason = String(entity.error_description || "").slice(0, 300);
        }
        await payment.save();
        const order = await Order.findById(payment.order);
        if (order) {
          if (event.event === "payment.captured" && order.payment.status !== "paid") {
            order.payment.status = "paid";
            order.payment.razorpayPaymentId = entity.id;
            order.payment.paidAt = new Date();
            await order.save();
          }
          if (event.event === "payment.failed" && order.payment.status === "pending") {
            order.payment.status = "failed";
            await order.save();
          }
        }
      }
    }
    res.json({ ok: true }); // always acknowledge so Razorpay stops retrying
  })
);

module.exports = router;
