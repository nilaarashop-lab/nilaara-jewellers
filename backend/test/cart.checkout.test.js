/**
 * Integration tests: server-side cart, login-required checkout, delivery
 * methods, live/old order views, email OTP (Resend — fetch stubbed in-process,
 * capturing the code exactly like the mock SMS provider), and the dev seed
 * script. Real Express app + in-memory MongoDB.
 */
process.env.NODE_ENV = "test";
process.env.OTP_PROVIDER = "mock";
process.env.OTP_HASH_SECRET = "integration-test-secret";
process.env.OTP_TTL_SECONDS = "300";
process.env.OTP_MAX_ATTEMPTS = "5";
process.env.OTP_RESEND_COOLDOWN_SEC = "30";
process.env.OTP_REQ_PER_PHONE = "50";
process.env.OTP_REQ_PER_IP = "500";
process.env.OTP_VERIFY_PER_PHONE = "100";
process.env.OTP_VERIFY_PER_IP = "500";
process.env.REGISTER_PER_IP = "200";
process.env.BCRYPT_ROUNDS = "6";
// Email OTP "configured" — delivery is stubbed below by intercepting fetch.
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_FROM = "Nilaara <otp@test.local>";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let server;
let base;
let mongod;

// ── Stub outbound HTTP: capture Resend payloads (OTP code for the test),
//    reject anything else. No real network in tests.
const sentEmails = [];
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://api.resend.com/emails")) {
    const body = JSON.parse(opts.body);
    sentEmails.push(body);
    return { ok: true, status: 200, json: async () => ({ id: "email-test-1" }) };
  }
  if (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")) return realFetch(url, opts);
  throw new Error(`Unexpected outbound request in tests: ${u}`);
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { createApp } = require("../app");
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = realFetch;
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function call(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `nilaara_sid=${cookie}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sid = setCookies.find((c) => c.startsWith("nilaara_sid="));
  return { status: res.status, data, cookie: sid ? sid.split(";")[0].split("=")[1] : null };
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

async function registerCustomer() {
  const email = `${uniq()}@example.com`;
  const r = await call("/api/auth/register", { method: "POST", body: { name: "Cart Tester", email, password: "secret123" } });
  assert.equal(r.status, 201);
  return r;
}

async function seedProduct(overrides = {}) {
  const Product = mongoose.model("Product");
  return Product.create({
    id: `test-${uniq()}`,
    slug: `test-product-${uniq()}`,
    name: "Test Kundan Necklace",
    price: 500,
    mrp: 1200,
    stock: 5,
    status: "published",
    ...overrides,
  });
}

/* ───────────────────────── Cart ───────────────────────── */

test("cart: guests cannot read or modify a cart (401 everywhere)", async () => {
  assert.equal((await call("/api/cart")).status, 401);
  assert.equal((await call("/api/cart/items", { method: "POST", body: { id: "x", qty: 1 } })).status, 401);
});

test("cart: add returns server-priced items; client-supplied prices are impossible", async () => {
  const cust = await registerCustomer();
  const p = await seedProduct({ price: 749, mrp: 1999 });
  const add = await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: p.id, qty: 2, price: 1 } });
  assert.equal(add.status, 201);
  assert.equal(add.data.items.length, 1);
  assert.equal(add.data.items[0].price, 749, "price must come from the DB record");
  assert.equal(add.data.items[0].qty, 2);
  assert.equal(add.data.totals.sub, 1498);

  const get = await call("/api/cart", { cookie: cust.cookie });
  assert.equal(get.status, 200);
  assert.equal(get.data.items[0].id, p.id);
});

test("cart: out-of-stock and unpublished products cannot be added", async () => {
  const cust = await registerCustomer();
  const soldOut = await seedProduct({ stock: 0 });
  const draft = await seedProduct({ status: "draft" });
  assert.equal((await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: soldOut.id, qty: 1 } })).status, 400);
  assert.equal((await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: draft.id, qty: 1 } })).status, 400);
  assert.equal((await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: "no-such-product", qty: 1 } })).status, 400);
  const get = await call("/api/cart", { cookie: cust.cookie });
  assert.equal(get.data.items.length, 0, "failed adds must not leave items behind");
});

test("cart: quantity is clamped to stock; oversize PATCH is rejected", async () => {
  const cust = await registerCustomer();
  const p = await seedProduct({ stock: 2 });
  // Adding 5 of a 2-stock product clamps to 2.
  const add = await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: p.id, qty: 5 } });
  assert.equal(add.data.items[0].qty, 2);
  // Explicitly setting qty above stock is rejected with a clear message.
  const over = await call(`/api/cart/items/${p.id}`, { method: "PATCH", cookie: cust.cookie, body: { qty: 5 } });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /stock/i);
  // Qty 0 removes the item.
  const zero = await call(`/api/cart/items/${p.id}`, { method: "PATCH", cookie: cust.cookie, body: { qty: 0 } });
  assert.equal(zero.status, 200);
  assert.equal(zero.data.items.length, 0);
});

test("cart: merging a guest cart after login keeps both sides, capped at stock", async () => {
  const cust = await registerCustomer();
  const a = await seedProduct({ stock: 10 });
  const b = await seedProduct({ stock: 1 });
  // The user already saved one item in their account cart…
  await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: a.id, qty: 1 } });
  // …then logs in from a device that had a guest cart.
  const merged = await call("/api/cart/merge", {
    method: "POST",
    cookie: cust.cookie,
    body: { items: [{ id: a.id, qty: 2 }, { id: b.id, qty: 3 }, { id: "gone-product", qty: 1 }] },
  });
  assert.equal(merged.status, 200);
  const byId = new Map(merged.data.items.map((i) => [i.id, i]));
  assert.equal(byId.get(a.id).qty, 3, "existing + guest quantities combine");
  assert.equal(byId.get(b.id).qty, 1, "clamped to stock");
  assert.ok(!byId.has("gone-product"), "unavailable guest items are dropped");
});

/* ───────────────────────── Checkout (login required) ───────────────────────── */

test("checkout: guests cannot place orders (401), even with a full payload", async () => {
  const p = await seedProduct();
  const r = await call("/api/orders", {
    method: "POST",
    body: {
      items: [{ id: p.id, qty: 1 }],
      customer: { name: "Guest", phone: "9876543210", address: "1 MG Road, Koregaon Park", city: "Pune", pin: "411001" },
    },
  });
  assert.equal(r.status, 401);
});

test("checkout: totals are computed on the server; cart is cleared; state/notes saved", async () => {
  const cust = await registerCustomer();
  const p = await seedProduct({ price: 400, mrp: 900, stock: 10 });
  await call("/api/cart/items", { method: "POST", cookie: cust.cookie, body: { id: p.id, qty: 2 } });

  const r = await call("/api/orders", {
    method: "POST",
    cookie: cust.cookie,
    body: {
      items: [{ id: p.id, qty: 2, price: 1 }], // price in the payload must be IGNORED
      customer: {
        name: "Cart Tester",
        phone: "9876543210",
        address: "Flat 4B, Lane 5, Koregaon Park",
        city: "Pune",
        state: "Maharashtra",
        pin: "411001",
        notes: "Ring the bell twice",
      },
      payment: "cod",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.totals.sub, 800, "server price × qty (browser price ignored)");
  // The full total must equal what the authoritative pricing engine produces
  // for the same items — never anything derived from the payload.
  const { computeTotals } = require("../services/pricing");
  const expected = computeTotals([{ id: p.id, name: p.name, price: 400, mrp: 900, qty: 2 }], "", await mongoose.model("SiteSettings").get());
  assert.equal(r.data.totals.total, expected.total, "total comes from the server pricing engine");
  assert.equal(r.data.customer.state, "Maharashtra");
  assert.equal(r.data.customer.notes, "Ring the bell twice");
  assert.equal(r.data.user || r.data.customer.name, "Cart Tester"); // owner scoping keeps working

  const cartAfter = await call("/api/cart", { cookie: cust.cookie });
  assert.equal(cartAfter.data.items.length, 0, "ordered cart is cleared server-side");

  // Invalid payloads are still rejected for logged-in callers.
  const badPhone = await call("/api/orders", {
    method: "POST",
    cookie: cust.cookie,
    body: { items: [{ id: p.id, qty: 1 }], customer: { name: "X", phone: "123", address: "12345", city: "Pune", pin: "411001" } },
  });
  assert.equal(badPhone.status, 400);
});

test("checkout: configured delivery methods drive shipping fee and ETA snapshot", async () => {
  const SiteSettings = mongoose.model("SiteSettings");
  const settings = await SiteSettings.get();
  settings.shipping.methods = [
    { id: "standard", label: "Standard Delivery", fee: 49, etaMinDays: 3, etaMaxDays: 5, enabled: true },
    { id: "express", label: "Express Delivery", fee: 149, etaMinDays: 1, etaMaxDays: 2, enabled: true },
  ];
  await settings.save();

  const cust = await registerCustomer();
  const p = await seedProduct({ price: 300, mrp: 600, stock: 10 }); // 300 → under freeOver(999)
  const r = await call("/api/orders", {
    method: "POST",
    cookie: cust.cookie,
    body: {
      items: [{ id: p.id, qty: 1 }],
      shippingMethod: "express",
      customer: { name: "Speedy", phone: "9812345670", address: "9 Link Road, Bandra West", city: "Mumbai", pin: "400050" },
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.totals.shipping, 149, "express fee applies");
  assert.equal(r.data.totals.total, 300 + 149);
  assert.equal(r.data.shipping.methodId, "express");
  assert.equal(r.data.shipping.label, "Express Delivery");
  assert.equal(r.data.shipping.etaMaxDays, 2);

  // Unknown method id → 400 (no invented pricing).
  const bad = await call("/api/orders", {
    method: "POST",
    cookie: cust.cookie,
    body: {
      items: [{ id: p.id, qty: 1 }],
      shippingMethod: "drone",
      customer: { name: "Speedy", phone: "9812345670", address: "9 Link Road, Bandra West", city: "Mumbai", pin: "400050" },
    },
  });
  assert.equal(bad.status, 400);

  // Free-shipping threshold still wins over method fees.
  const big = await seedProduct({ price: 1500, mrp: 3000, stock: 10 });
  const freeShip = await call("/api/orders", {
    method: "POST",
    cookie: cust.cookie,
    body: {
      items: [{ id: big.id, qty: 1 }],
      shippingMethod: "express",
      customer: { name: "Speedy", phone: "9812345670", address: "9 Link Road, Bandra West", city: "Mumbai", pin: "400050" },
    },
  });
  assert.equal(freeShip.data.totals.shipping, 0, "free over ₹999 regardless of method");

  // Reset methods so later tests see the default config.
  settings.shipping.methods = [];
  await settings.save();
});

test("checkout preview: server recalculates totals without creating an order", async () => {
  const cust = await registerCustomer();
  const p = await seedProduct({ price: 600, mrp: 1400, stock: 8 });

  // Guests cannot even preview (checkout is login-only end to end).
  const guest = await call("/api/orders/preview", { method: "POST", body: { items: [{ id: p.id, qty: 2 }] } });
  assert.equal(guest.status, 401);

  const r = await call("/api/orders/preview", {
    method: "POST",
    cookie: cust.cookie,
    body: { items: [{ id: p.id, qty: 2, price: 1 }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.sub, 1200, "server price × qty");
  assert.ok(r.data.total > 0);

  // No order was created by previewing.
  assert.equal(await mongoose.model("Order").countDocuments({ user: cust.data.user.id }), 0);

  // Unknown delivery method is still rejected here.
  const bad = await call("/api/orders/preview", { method: "POST", cookie: cust.cookie, body: { items: [{ id: p.id, qty: 1 }], shippingMethod: "jetpack" } });
  assert.equal(bad.status, 400);
});

test("orders/mine: ?view=live and ?view=old split by REAL statuses", async () => {
  const cust = await registerCustomer();
  const Order = mongoose.model("Order");
  const mk = (status) =>
    Order.create({
      orderNumber: `NIL-TEST-${uniq()}`,
      user: cust.data.user.id,
      items: [{ productId: "par-x", name: "Stud", price: 100, mrp: 200, qty: 1 }],
      totals: { total: 100 },
      status,
      customer: { name: "Cart Tester", phone: "9876543210", address: "1 MG Road", city: "Pune", pin: "411001" },
    });
  await mk("placed");
  await mk("shipped");
  await mk("delivered");
  await mk("cancelled");

  const live = await call("/api/orders/mine?view=live", { cookie: cust.cookie });
  assert.equal(live.status, 200);
  assert.deepEqual(new Set(live.data.map((o) => o.status)), new Set(["placed", "shipped"]));
  const old = await call("/api/orders/mine?view=old", { cookie: cust.cookie });
  assert.deepEqual(new Set(old.data.map((o) => o.status)), new Set(["delivered", "cancelled"]));
  const all = await call("/api/orders/mine", { cookie: cust.cookie });
  assert.equal(all.data.length, 4);
});

/* ───────────────────────── Email OTP (Resend, stubbed) ───────────────────────── */

test("email OTP: request never returns the code; wrong code → 400; correct → session", async () => {
  const email = `${uniq()}@example.com`;
  const r = await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  assert.equal(r.status, 200);
  assert.ok(r.data.email.includes("***"), "email must be masked");
  assert.equal(typeof r.data.cooldown, "number");

  const sent = sentEmails.filter((m) => m.to && m.to.includes(email)).pop();
  assert.ok(sent, "delivery was attempted through the Resend API shape");
  const code = (sent.text.match(/code is ([0-9]{6})/) || [])[1];
  assert.match(code, /^[0-9]{6}$/);
  assert.ok(!JSON.stringify(r.data).includes(code), "response must not contain the code");

  // Hashed at rest with the "email" purpose.
  const challenge = await mongoose.model("OtpChallenge").findOne({ email });
  assert.ok(challenge && challenge.channel === "email");
  assert.notEqual(challenge.codeHash, code);

  const wrong = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: "000000" } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.error, /attempt/);

  const ok = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, "customer");
  assert.equal(ok.data.user.emailVerified, true);
  assert.ok(ok.cookie);

  // Single-use.
  const replay = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: code } });
  assert.equal(replay.status, 400);
});

test("email OTP signup stores the given name for booking info", async () => {
  const email = `${uniq()}@example.com`;
  await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  const code = (sentEmails.filter((m) => m.to && m.to.includes(email)).pop().text.match(/code is ([0-9]{6})/) || [])[1];
  const ok = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: code, name: "Aarohi Sharma" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, "Aarohi Sharma");
});

test("email OTP signup sets the login password and never overwrites it", async () => {
  const email = `${uniq()}@example.com`;
  const lastCode = () => (sentEmails.filter((m) => m.to && m.to.includes(email)).pop().text.match(/code is ([0-9]{6})/) || [])[1];

  await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  const signup = await call("/api/auth/email/otp/verify", {
    method: "POST",
    body: { email, otp: lastCode(), name: "Meera Rao", password: "secret123" },
  });
  assert.equal(signup.status, 200);

  const wrong = await call("/api/auth/login", { method: "POST", body: { id: email, password: "wrong-pass" } });
  assert.equal(wrong.status, 401);
  const ok = await call("/api/auth/login", { method: "POST", body: { id: email, password: "secret123" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, email);

  // Registering the same inbox again must not reset an existing password.
  await mongoose.model("OtpChallenge").updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 120000) } });
  await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  const again = await call("/api/auth/email/otp/verify", {
    method: "POST",
    body: { email, otp: lastCode(), password: "different123" },
  });
  assert.equal(again.status, 200);
  const stillOld = await call("/api/auth/login", { method: "POST", body: { id: email, password: "secret123" } });
  assert.equal(stillOld.status, 200);
  const notNew = await call("/api/auth/login", { method: "POST", body: { id: email, password: "different123" } });
  assert.equal(notNew.status, 401);
});

test("email OTP: resend cooldown, expiry and lockout are enforced", async () => {
  const email = `${uniq()}@example.com`;
  const first = await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  assert.equal(first.status, 200);
  const second = await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  assert.equal(second.status, 429);
  assert.ok(second.data.retryAfterSec > 0);

  const code = (sentEmails.filter((m) => m.to && m.to.includes(email)).pop().text.match(/code is ([0-9]{6})/) || [])[1];
  // Expire it.
  await mongoose.model("OtpChallenge").updateOne({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: code } });
  assert.equal(expired.status, 400);
  assert.match(expired.data.error, /expired/i);

  // Lockout: 5 wrong attempts on a fresh challenge.
  const fresh = `${uniq()}@example.com`;
  await call("/api/auth/email/otp/request", { method: "POST", body: { email: fresh } });
  let last;
  for (let i = 0; i < 5; i++) last = await call("/api/auth/email/otp/verify", { method: "POST", body: { email: fresh, otp: "999999" } });
  assert.equal(last.status, 429);
  assert.match(last.data.error, /Too many/);
});

test("email OTP never grants admin privileges and links to existing accounts by email", async () => {
  const email = `${uniq()}@example.com`;
  // Existing customer with a password signs in via email OTP → SAME account.
  await call("/api/auth/register", { method: "POST", body: { name: "Dual", email, password: "secret123" } });
  await call("/api/auth/email/otp/request", { method: "POST", body: { email } });
  const code = (sentEmails.filter((m) => m.to && m.to.includes(email)).pop().text.match(/code is ([0-9]{6})/) || [])[1];
  const ok = await call("/api/auth/email/otp/verify", { method: "POST", body: { email, otp: code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, "customer");
  assert.equal(await mongoose.model("User").countDocuments({ email }), 1, "no duplicate account");
  // And a brand-new email creates a customer only.
  const fresh = `${uniq()}@example.com`;
  await call("/api/auth/email/otp/request", { method: "POST", body: { email: fresh } });
  const c2 = (sentEmails.filter((m) => m.to && m.to.includes(fresh)).pop().text.match(/code is ([0-9]{6})/) || [])[1];
  const created = await call("/api/auth/email/otp/verify", { method: "POST", body: { email: fresh, otp: c2 } });
  assert.equal(created.data.user.role, "customer");
});

/* ───────────────────────── Seed script ───────────────────────── */

test("seed:accounts creates dev accounts, never overwrites, refuses production", async () => {
  const { seedTestAccounts } = require("../scripts/seed-test-accounts");
  const User = mongoose.model("User");

  const first = await seedTestAccounts();
  assert.equal(first.ok, true);
  assert.equal(first.created.length, 2, "customer + admin created");
  const admin = await User.findOne({ email: "admin@nilaara.test" });
  assert.equal(admin.role, "admin");
  const customer = await User.findOne({ email: "customer@nilaara.test" });
  assert.equal(customer.role, "customer");
  assert.ok(customer.passwordHash, "password is hashed, never plaintext");

  // Tamper with the admin password hash — a re-run must NOT touch it.
  await User.updateOne({ email: "admin@nilaara.test" }, { $set: { passwordHash: "sentinel-not-a-hash" } });
  const second = await seedTestAccounts();
  assert.equal(second.created.length, 0, "nothing created on re-run");
  assert.equal(second.skipped.length, 2);
  const afterRerun = await User.findOne({ email: "admin@nilaara.test" });
  assert.equal(afterRerun.passwordHash, "sentinel-not-a-hash", "existing users are never overwritten");
  assert.equal(afterRerun.role, "admin", "roles are never changed unexpectedly");

  // Production refusal.
  const prod = await seedTestAccounts({ isProd: true });
  assert.equal(prod.ok, false);
  assert.match(prod.error, /production/i);
});
