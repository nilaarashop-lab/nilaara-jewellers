/**
 * Razorpay integration — real provider APIs, server-side verification.
 * All secrets stay server-side. Live payments stay DISABLED until keys AND the
 * webhook secret are configured (env.paymentsEnabled()).
 *
 * Verification model:
 *  - checkout success  → POST /api/payments/:orderNumber/verify (HMAC over order_id|payment_id)
 *  - webhook           → POST /api/payments/razorpay/webhook (HMAC over raw body, idempotent)
 * The order is only marked paid after a VERIFIED signature or a verified webhook event.
 */
const crypto = require("crypto");
const env = require("../config/env");
const { HttpError } = require("../lib/apiError");

let _instance = null;
function client() {
  if (!env.paymentsEnabled()) return null;
  if (!_instance) {
    const Razorpay = require("razorpay");
    _instance = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return _instance;
}

/** Creates the provider-side order for a given amount (already computed by pricing). */
async function createProviderOrder({ amountTotal, orderNumber, orderId }) {
  const c = client();
  if (!c) throw new HttpError(503, "Online payments are not configured yet. Please choose Cash on Delivery.");
  const order = await c.orders.create({
    amount: Math.round(amountTotal * 100), // paise
    currency: "INR",
    receipt: String(orderNumber),
    notes: { orderId: String(orderId) },
  });
  return { id: order.id, amount: order.amount, currency: order.currency, keyId: env.RAZORPAY_KEY_ID };
}

/** HMAC-SHA256 signature verification for checkout responses. */
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (!env.RAZORPAY_KEY_SECRET || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** HMAC-SHA256 verification of webhook payloads against the raw request body. */
function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !rawBody || !signature) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** Server-side refund (only usable with live keys). */
async function createRefund({ paymentId, amountPaise, notes }) {
  const c = client();
  if (!c) throw new HttpError(503, "Payments are not configured — cannot create a refund.");
  return c.refunds.create({ payment_id: paymentId, amount: amountPaise, notes });
}

module.exports = { client, createProviderOrder, verifyPaymentSignature, verifyWebhookSignature, createRefund };
