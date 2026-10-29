/** Razorpay signature verification (pure crypto — no network, no real keys). */
process.env.RAZORPAY_KEY_SECRET = "test_secret_do_not_use";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";

const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { verifyPaymentSignature, verifyWebhookSignature } = require("../services/razorpay");

test("accepts a correctly signed checkout response", () => {
  const sig = crypto.createHmac("sha256", "test_secret_do_not_use").update("order_123|pay_456").digest("hex");
  assert.equal(verifyPaymentSignature({ razorpayOrderId: "order_123", razorpayPaymentId: "pay_456", signature: sig }), true);
});

test("rejects a wrong or tampered signature", () => {
  assert.equal(verifyPaymentSignature({ razorpayOrderId: "order_123", razorpayPaymentId: "pay_456", signature: "deadbeef" }), false);
  const sig = crypto.createHmac("sha256", "test_secret_do_not_use").update("order_999|pay_456").digest("hex");
  assert.equal(verifyPaymentSignature({ razorpayOrderId: "order_123", razorpayPaymentId: "pay_456", signature: sig }), false);
});

test("rejects missing components instead of throwing", () => {
  assert.equal(verifyPaymentSignature({}), false);
  assert.equal(verifyPaymentSignature({ razorpayOrderId: "o", razorpayPaymentId: "p" }), false);
});

test("verifies webhook signatures over the raw body", () => {
  const body = JSON.stringify({ id: "evt_1", event: "payment.captured" });
  const sig = crypto.createHmac("sha256", "test_webhook_secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, sig), true);
  assert.equal(verifyWebhookSignature(body + " ", sig), false);
  assert.equal(verifyWebhookSignature(body, "bad"), false);
});
