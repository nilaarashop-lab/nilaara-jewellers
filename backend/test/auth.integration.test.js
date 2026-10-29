/**
 * End-to-end authentication tests against the REAL Express app with an
 * in-memory MongoDB (mongodb-memory-server). Covers:
 *  - register / password login / logout / session persistence
 *  - OTP request→verify (mock SMS provider: codes captured in-process, never
 *    returned in responses), wrong/expired/exhausted codes, resend cooldown
 *  - Google token rejection (no valid token can be minted offline)
 *  - CSRF origin guard
 *  - customer/admin access separation and per-customer order isolation
 *
 * The mock provider is refused in production (env validation + call-time guard).
 */
process.env.NODE_ENV = "test";
process.env.OTP_PROVIDER = "mock";
process.env.OTP_HASH_SECRET = "integration-test-secret";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.OTP_TTL_SECONDS = "300";
process.env.OTP_MAX_ATTEMPTS = "5";
process.env.OTP_RESEND_COOLDOWN_SEC = "30";
// High ceilings so the general flow is not throttled; one dedicated test
// exercises the per-phone OTP request limiter with its own number.
process.env.OTP_REQ_PER_PHONE = "6";
process.env.OTP_REQ_PER_IP = "500";
process.env.OTP_VERIFY_PER_PHONE = "100";
process.env.OTP_VERIFY_PER_IP = "500";
process.env.REGISTER_PER_IP = "200";
process.env.BCRYPT_ROUNDS = "6"; // fast tests

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let server;
let base;
let mongod;

const mockOtp = require("../lib/otp/providers/mock");

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
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

/** Calls the API; returns { status, data, cookie } (cookie = session token when set). */
async function call(path, { method = "GET", body, cookie, origin, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `nilaara_sid=${cookie}` } : {}),
      ...(origin ? { Origin: origin } : {}),
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
  return { status: res.status, data, cookie: sid ? sid.split(";")[0].split("=")[1] : null, rawSetCookie: sid };
}

// Unique emails/phones per test (no cross-test interference).
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

test("register creates a customer session; role in the body is ignored", async () => {
  const email = `${uniq()}@example.com`;
  const r = await call("/api/auth/register", {
    method: "POST",
    body: { name: "Aarohi Sharma", email, password: "secret123", role: "admin" },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, "customer", "role must always be customer");
  assert.ok(r.cookie, "session cookie must be set");

  const me = await call("/api/auth/me", { cookie: r.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
  assert.equal(me.data.user.role, "customer");
});

test("password login: wrong password and unknown user both return generic 401", async () => {
  const email = `${uniq()}@example.com`;
  await call("/api/auth/register", { method: "POST", body: { name: "Test User", email, password: "secret123" } });
  const wrong = await call("/api/auth/login", { method: "POST", body: { id: email, password: "wrong-pass" } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, "Invalid credentials.");
  const unknown = await call("/api/auth/login", { method: "POST", body: { id: `${uniq()}@nope.com`, password: "whatever" } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error, "Invalid credentials.");
  const ok = await call("/api/auth/login", { method: "POST", body: { id: email, password: "secret123" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie);
});

test("login accepts a normalized phone number for password accounts", async () => {
  const phone = "98" + String(Date.now()).slice(-8);
  const reg = await call("/api/auth/register", {
    method: "POST",
    body: { name: "Phone User", phone, password: "secret123" },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.phoneVerified, false, "signup phone is unverified until OTP");
  const login = await call("/api/auth/login", { method: "POST", body: { id: `+91 ${phone}`, password: "secret123" } });
  assert.equal(login.status, 200);
});

test("consecutive email-only registrations both succeed (sparse phone index skips absent, not null)", async () => {
  const User = mongoose.model("User");
  await User.init(); // ensure the unique indexes exist before the writes — this is what production has

  const first = await call("/api/auth/register", {
    method: "POST",
    body: { name: "First Email Only", email: `${uniq()}@example.com`, password: "secret123" },
  });
  assert.equal(first.status, 201);

  const second = await call("/api/auth/register", {
    method: "POST",
    body: { name: "Second Email Only", email: `${uniq()}@example.com`, password: "secret123" },
  });
  assert.equal(second.status, 201, `second email-only signup must succeed, got ${JSON.stringify(second.data)}`);

  const stored = await User.findById(second.data.user.id).lean();
  assert.equal(stored.phone, undefined, "absent phone must be omitted, never stored as null");
});

test("logout destroys the session server-side and clears the cookie", async () => {
  const email = `${uniq()}@example.com`;
  const reg = await call("/api/auth/register", { method: "POST", body: { name: "Logout User", email, password: "secret123" } });
  const out = await call("/api/auth/logout", { method: "POST", cookie: reg.cookie });
  assert.equal(out.status, 200);
  assert.ok(out.rawSetCookie && /^nilaara_sid=;/.test(out.rawSetCookie), "cookie must be cleared");
  const me = await call("/api/auth/me", { cookie: reg.cookie });
  assert.equal(me.status, 401, "old token must be dead server-side");
});

test("PATCH /me updates the profile; requires a session; rejects duplicate email", async () => {
  const unauth = await call("/api/auth/me", { method: "PATCH", body: { name: "X" } });
  assert.equal(unauth.status, 401);

  const emailA = `${uniq()}@example.com`;
  const emailB = `${uniq()}@example.com`;
  const reg = await call("/api/auth/register", { method: "POST", body: { name: "Old Name", email: emailA, password: "secret123" } });
  await call("/api/auth/register", { method: "POST", body: { name: "Other", email: emailB, password: "secret123" } });

  const dup = await call("/api/auth/me", { method: "PATCH", cookie: reg.cookie, body: { email: emailB } });
  assert.equal(dup.status, 409, "cannot take another account's email");

  const upd = await call("/api/auth/me", { method: "PATCH", cookie: reg.cookie, body: { name: "New Name" } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.user.name, "New Name");
});

test("OTP request returns masked metadata and NEVER the code; code is HMAC-hashed at rest", async () => {
  const phone = "97" + String(Date.now()).slice(-8);
  const r = await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.ok(r.data.phone.includes("•••"), "phone must be masked");
  assert.ok(!JSON.stringify(r.data).includes(mockOtp.getLastCode(phone)), "response must not contain the OTP");
  assert.equal(typeof r.data.cooldown, "number");
  assert.equal(typeof r.data.expiresIn, "number");

  const code = mockOtp.getLastCode(phone);
  assert.match(code, /^[0-9]{6}$/);
  const challenge = await mongoose.model("OtpChallenge").findOne({ phone });
  assert.ok(challenge, "challenge stored");
  assert.notEqual(challenge.codeHash, code, "code must be stored hashed, not plaintext");
  assert.ok(!challenge.codeHash.includes(code));
});

test("OTP verify: wrong code → 400 with attempts left; correct code → customer session", async () => {
  const phone = "96" + String(Date.now()).slice(-8);
  await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  const code = mockOtp.getLastCode(phone);

  const wrong = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: "000000" } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.error, /attempt/);

  const ok = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, "customer");
  assert.equal(ok.data.user.phoneVerified, true);
  assert.ok(ok.cookie);

  const me = await call("/api/auth/me", { cookie: ok.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.phone, phone);

  // The code is single-use — replaying it fails.
  const replay = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: code } });
  assert.equal(replay.status, 400);
  assert.match(replay.data.error, /No active verification/);
});

test("OTP resend is throttled by the cooldown", async () => {
  const phone = "95" + String(Date.now()).slice(-8);
  const first = await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  assert.equal(first.status, 200);
  const second = await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  assert.equal(second.status, 429);
  assert.ok(second.data.retryAfterSec > 0);
  assert.match(second.data.error, /wait/i);
});

test("expired OTP codes are rejected and removed", async () => {
  const phone = "94" + String(Date.now()).slice(-8);
  await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  const code = mockOtp.getLastCode(phone);
  await mongoose.model("OtpChallenge").updateOne({ phone }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const r = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: code } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /expired/i);
  const gone = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: code } });
  assert.equal(gone.status, 400);
  assert.match(gone.data.error, /No active verification/);
});

test("too many wrong attempts locks the code; a fresh request is required", async () => {
  const phone = "93" + String(Date.now()).slice(-8);
  await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  const code = mockOtp.getLastCode(phone);
  for (let i = 0; i < 4; i++) {
    const r = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: "111111" } });
    assert.equal(r.status, 400, `wrong try ${i + 1} should be 400`);
  }
  const locked = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: "111111" } });
  assert.equal(locked.status, 429, "5th wrong try locks the challenge");
  const afterLock = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: code } });
  assert.equal(afterLock.status, 400, "even the correct code fails after lockout");
  assert.match(afterLock.data.error, /No active verification/);
});

test("OTP verification of an existing password account logs into that same account", async () => {
  const phone = "92" + String(Date.now()).slice(-8);
  const reg = await call("/api/auth/register", { method: "POST", body: { name: "Linked User", phone, password: "secret123" } });
  const userId = reg.data.user.id;
  await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  const ok = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: mockOtp.getLastCode(phone) } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.id, userId, "must be the same account, not a duplicate");
  assert.equal(ok.data.user.phoneVerified, true, "OTP marks the phone verified");
  assert.equal(await mongoose.model("User").countDocuments({ phone }), 1);
});

test("per-phone OTP request limiter kicks in after the configured maximum", async () => {
  const phone = "91" + String(Date.now()).slice(-8);
  let last;
  for (let i = 0; i < 6; i++) last = await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  // First succeeds, the rest are cooldown-blocked but still counted.
  const overflow = await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  assert.equal(overflow.status, 429);
  assert.match(overflow.data.error, /Too many/);
  assert.ok(last.status === 429 || last.status === 200);
});

test("invalid Google credentials are rejected outright", async () => {
  const garbage = await call("/api/auth/google", { method: "POST", body: { credential: "a".repeat(64) } });
  assert.equal(garbage.status, 400);
  const missing = await call("/api/auth/google", { method: "POST", body: {} });
  assert.equal(missing.status, 400);
  const linkUnauth = await call("/api/auth/google/link", { method: "POST", body: { credential: "a".repeat(64) } });
  assert.equal(linkUnauth.status, 401, "linking requires a session first");
});

test("CSRF guard blocks state-changing requests from foreign origins", async () => {
  const evil = await call("/api/auth/login", { method: "POST", origin: "https://evil.example.com", body: { id: "x@y.com", password: "pw" } });
  assert.equal(evil.status, 403);
  assert.match(evil.data.error, /origin/i);
  const good = await call("/api/auth/login", { method: "POST", origin: "http://localhost:5173", body: { id: "x@y.com", password: "pw" } });
  assert.notEqual(good.status, 403, "our own frontend origin must pass CSRF");
});

test("customers cannot reach admin routes; admins can", async () => {
  const email = `${uniq()}@example.com`;
  const cust = await call("/api/auth/register", { method: "POST", body: { name: "Customer", email, password: "secret123" } });
  assert.equal((await call("/api/orders", { cookie: cust.cookie })).status, 403);
  assert.equal((await call("/api/stats", { cookie: cust.cookie })).status, 403);
  assert.equal((await call("/api/orders/0123456789abcdef01234567", { method: "PATCH", cookie: cust.cookie, body: { status: "packed" } })).status, 403);
  assert.equal((await call("/api/upload", { method: "POST", cookie: cust.cookie })).status, 403);
  assert.equal((await call("/api/auth/google/link", { method: "POST", cookie: cust.cookie, body: { credential: "a".repeat(64) } })).status, 400, "customer link attempt reaches validation");

  // Admin created the sanctioned way (direct model write, like create-admin).
  const bcrypt = require("bcryptjs");
  const adminEmail = `${uniq()}@nilaara.com`;
  const admin = await mongoose.model("User").create({ name: "Admin", email: adminEmail, provider: "password", role: "admin" });
  admin.passwordHash = await bcrypt.hash("admin-secret-123", 6);
  await admin.save();
  const adminLogin = await call("/api/auth/login", { method: "POST", body: { id: adminEmail, password: "admin-secret-123" } });
  assert.equal(adminLogin.status, 200);
  assert.equal((await call("/api/orders", { cookie: adminLogin.cookie })).status, 200);
  assert.equal((await call("/api/stats", { cookie: adminLogin.cookie })).status, 200);
});

test("customers can only see their OWN orders in /orders/mine", async () => {
  const Order = mongoose.model("Order");
  const a = await call("/api/auth/register", { method: "POST", body: { name: "Ana", email: `${uniq()}@example.com`, password: "secret123" } });
  const b = await call("/api/auth/register", { method: "POST", body: { name: "Bella", email: `${uniq()}@example.com`, password: "secret123" } });
  await Order.create({
    orderNumber: `NIL-TEST-${uniq()}`,
    user: a.data.user.id,
    items: [{ productId: "par-x", name: "Kundan Set", price: 999, mrp: 1999, qty: 1 }],
    totals: { total: 999 },
    customer: { name: "Ana", phone: "9876543210", address: "1 MG Road", city: "Pune", pin: "411001" },
  });
  const mineA = await call("/api/orders/mine", { cookie: a.cookie });
  assert.equal(mineA.status, 200);
  assert.equal(mineA.data.length, 1);
  const mineB = await call("/api/orders/mine", { cookie: b.cookie });
  assert.equal(mineB.status, 200);
  assert.equal(mineB.data.length, 0, "customer B must not see customer A's order");
  const unauth = await call("/api/orders/mine");
  assert.equal(unauth.status, 401);
});

test("OTP login never grants admin privileges", async () => {
  const phone = "90" + String(Date.now()).slice(-8);
  await call("/api/auth/otp/request", { method: "POST", body: { phone } });
  const ok = await call("/api/auth/otp/verify", { method: "POST", body: { phone, otp: mockOtp.getLastCode(phone) } });
  assert.equal(ok.data.user.role, "customer");
  assert.equal((await call("/api/stats", { cookie: ok.cookie })).status, 403);
});
