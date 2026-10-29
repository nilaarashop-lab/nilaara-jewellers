/**
 * App-level tests that boot the real Express app (via createApp) on an
 * ephemeral port WITHOUT a MongoDB connection. They verify:
 *  - security headers are present
 *  - admin-only routes reject anonymous callers with 401 (never 200)
 *  - input validation returns 400
 *  - unconfigured payments return 503 (no fake success)
 *  - unknown routes return 404
 */
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "cloudinary";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
process.env.RAZORPAY_KEY_ID = "";
process.env.RAZORPAY_KEY_SECRET = "";
process.env.RAZORPAY_WEBHOOK_SECRET = "";
process.env.RESEND_API_KEY = "";
process.env.OTP_PROVIDER = "";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../app");

let server;
let base;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

const call = async (path, opts = {}) => {
  const res = await fetch(base + path, {
    method: opts.method || "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data, headers: res.headers };
};

test("GET /api/health responds and reports the configured storage driver", async () => {
  const { status, data } = await call("/api/health");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.storage, "cloudinary");
});

test("security headers are set by helmet", async () => {
  const { headers } = await call("/api/health");
  assert.ok(headers.get("x-content-type-options") === "nosniff");
  assert.ok(headers.get("x-frame-options"));
  assert.ok(headers.get("content-security-policy"));
});

test("POST /api/products requires an admin session", async () => {
  const { status } = await call("/api/products", { method: "POST", body: { name: "Ring", price: 100 } });
  assert.equal(status, 401);
});

test("POST /api/upload requires an admin session", async () => {
  const { status } = await call("/api/upload", { method: "POST", body: {} });
  assert.equal(status, 401);
});

test("PUT /api/products/:id requires an admin session", async () => {
  const { status } = await call("/api/products/par-x", { method: "PUT", body: { price: 1 } });
  assert.equal(status, 401);
});

test("DELETE /api/products/:id requires an admin session", async () => {
  const { status } = await call("/api/products/par-x", { method: "DELETE" });
  assert.equal(status, 401);
});

test("DELETE /api/upload/assets/:publicId requires an admin session", async () => {
  // Real clients send the publicId URL-encoded (it contains "/").
  const { status } = await call(`/api/upload/assets/${encodeURIComponent("nilaara/products/x")}`, { method: "DELETE" });
  assert.equal(status, 401);
});

test("GET /api/orders (admin list) requires a session", async () => {
  const { status } = await call("/api/orders");
  assert.equal(status, 401);
});

test("PATCH /api/orders/:id requires a session", async () => {
  const { status } = await call("/api/orders/64b000000000000000000000", { method: "PATCH", body: { status: "packed" } });
  assert.equal(status, 401);
});

test("GET /api/stats requires a session", async () => {
  const { status } = await call("/api/stats");
  assert.equal(status, 401);
});

test("POST /api/auth/login rejects malformed payloads with 400 (before touching the DB)", async () => {
  const { status } = await call("/api/auth/login", { method: "POST", body: { id: "x" } }); // missing password
  assert.equal(status, 400);
});

test("POST /api/orders rejects GUEST checkout with 401 (login required)", async () => {
  // Even a malformed payload must not reveal validation details to a guest —
  // authentication is checked first. (Field validation for logged-in callers
  // is covered in auth.integration.test.js.)
  const empty = await call("/api/orders", { method: "POST", body: { items: [], customer: {} } });
  assert.equal(empty.status, 401);
  const badPhone = await call("/api/orders", {
    method: "POST",
    body: {
      items: [{ id: "par-x", qty: 1 }],
      customer: { name: "Test", phone: "123", address: "somewhere long enough", city: "Pune", pin: "411001" },
    },
  });
  assert.equal(badPhone.status, 401);
});

test("cart routes require a session (guests cannot build a cart)", async () => {
  assert.equal((await call("/api/cart")).status, 401);
  assert.equal((await call("/api/cart/items", { method: "POST", body: { id: "par-x", qty: 1 } })).status, 401);
  assert.equal((await call("/api/cart/merge", { method: "POST", body: { items: [] } })).status, 401);
  assert.equal((await call("/api/cart/items/par-x", { method: "PATCH", body: { qty: 2 } })).status, 401);
  assert.equal((await call("/api/cart/items/par-x", { method: "DELETE" })).status, 401);
});

test("payments routes answer 503 while Razorpay keys are unset (no fake success)", async () => {
  const { status } = await call("/api/payments/NIL-TEST/order", { method: "POST", body: {} });
  assert.equal(status, 503);
});

test("OTP endpoints answer 503 while no SMS provider is configured (no fake success)", async () => {
  const req = await call("/api/auth/otp/request", { method: "POST", body: { phone: "9876543210" } });
  assert.equal(req.status, 503);
  const ver = await call("/api/auth/otp/verify", { method: "POST", body: { phone: "9876543210", otp: "123456" } });
  assert.equal(ver.status, 503);
});

test("Email OTP endpoints answer 503 while Resend is unconfigured (no fake success)", async () => {
  const req = await call("/api/auth/email/otp/request", { method: "POST", body: { email: "someone@example.com" } });
  assert.equal(req.status, 503);
  const ver = await call("/api/auth/email/otp/verify", { method: "POST", body: { email: "someone@example.com", otp: "123456" } });
  assert.equal(ver.status, 503);
});

test("Google sign-in answers 503 while GOOGLE_CLIENT_ID is unset", async () => {
  const { status } = await call("/api/auth/google", { method: "POST", body: { credential: "a".repeat(64) } });
  assert.equal(status, 503);
});

test("PATCH /api/auth/me and GET /api/orders/mine require a session", async () => {
  assert.equal((await call("/api/auth/me", { method: "PATCH", body: { name: "X" } })).status, 401);
  assert.equal((await call("/api/orders/mine")).status, 401);
});

test("CSRF guard rejects state-changing requests from foreign origins", async () => {
  const { status, data } = await call("/api/auth/login", { method: "POST", origin: "https://evil.example.com", body: { id: "a@b.com", password: "x" } });
  assert.equal(status, 403);
  assert.match(data.error, /origin/i);
});

test("unknown API routes return 404", async () => {
  const { status } = await call("/api/does-not-exist");
  assert.equal(status, 404);
});
