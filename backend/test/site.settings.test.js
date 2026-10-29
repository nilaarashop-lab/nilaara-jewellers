/**
 * Integration tests: homepage content + announcement marquee settings.
 *  - Public GET exposes ONLY the storefront-safe subset (marquee lines, hero
 *    slides, cards, festive image) — never internal flags or image publicIds.
 *  - Guests and customers cannot read the admin document or change settings.
 *  - Admin/staff can update; image URLs must be from approved hosts.
 *  - Inactive slides/messages never reach the storefront.
 * Real Express app + in-memory MongoDB.
 */
process.env.NODE_ENV = "test";
process.env.OTP_PROVIDER = "";
process.env.BCRYPT_ROUNDS = "6";
process.env.STORAGE_DRIVER = "local";
process.env.PUBLIC_BASE_URL = "http://localhost:5000";
process.env.ALLOWED_IMAGE_HOSTS = "images.unsplash.com";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let server;
let base;
let mongod;

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
  const r = await call("/api/auth/register", {
    method: "POST",
    body: { name: "Settings Customer", email: `${uniq()}@example.com`, password: "secret123" },
  });
  assert.equal(r.status, 201);
  return r;
}

/** Admin created the sanctioned way (direct model write, like create-admin). */
async function loginAdmin() {
  const bcrypt = require("bcryptjs");
  const email = `admin-${uniq()}@nilaara.test`;
  const admin = await mongoose.model("User").create({ name: "Admin", email, provider: "password", role: "admin" });
  admin.passwordHash = await bcrypt.hash("admin-secret-123", 6);
  await admin.save();
  const r = await call("/api/auth/login", { method: "POST", body: { id: email, password: "admin-secret-123" } });
  assert.equal(r.status, 200);
  return r;
}

const CLOUD_IMG = "https://res.cloudinary.com/test-cloud/image/upload/nilaara/products/hero.jpg";

test("public settings include marquee + homepage content, and never internal fields", async () => {
  const admin = await loginAdmin();
  const patch = await call("/api/settings", {
    method: "PATCH",
    cookie: admin.cookie,
    body: {
      announcement: {
        active: true,
        messages: [
          { text: "Festive B1G1 — this week only" },
          { text: "Free shipping over ₹999" },
          { text: "Hidden message", active: false },
        ],
      },
      home: {
        heroSlides: [
          {
            image: { url: CLOUD_IMG, publicId: "nilaara/products/hero.jpg", alt: "Bridal set" },
            eyebrow: "Bridal Edit",
            title: "The Wedding Collection",
            highlight: "now live",
            text: "Hand-finished kundan & temple sets.",
          },
          { title: "Inactive slide", active: false },
        ],
        cards: [
          { image: { url: CLOUD_IMG }, eyebrow: "New", title: "Kundan Festive Sets", text: "From ₹749", to: "/shop?col=kundan" },
        ],
        festive: { image: { url: CLOUD_IMG, publicId: "nilaara/products/hero.jpg" }, active: true },
      },
    },
  });
  assert.equal(patch.status, 200);

  const pub = await call("/api/settings");
  assert.equal(pub.status, 200);
  // Marquee: active lines only, in order, as plain strings.
  assert.deepEqual(pub.data.announcement.messages, ["Festive B1G1 — this week only", "Free shipping over ₹999"]);
  // Hero: active slide with storefront shape (url + alt only — NO publicId).
  assert.equal(pub.data.home.heroSlides.length, 1);
  assert.equal(pub.data.home.heroSlides[0].title, "The Wedding Collection");
  assert.deepEqual(pub.data.home.heroSlides[0].image, { url: CLOUD_IMG, alt: "Bridal set" });
  assert.equal(pub.data.home.cards[0].to, "/shop?col=kundan");
  assert.deepEqual(pub.data.home.festive, { url: CLOUD_IMG, alt: "", active: true });
  // Never leak internal fields.
  const flat = JSON.stringify(pub.data);
  assert.ok(!flat.includes("publicId"), "public payload must not contain publicIds");
  assert.ok(!flat.includes("updatedBy"));
});

test("guests and customers cannot read or change homepage settings", async () => {
  const cust = await registerCustomer();
  assert.equal((await call("/api/settings/admin")).status, 401);
  assert.equal((await call("/api/settings/admin", { cookie: cust.cookie })).status, 403);
  assert.equal((await call("/api/settings", { method: "PATCH", body: { announcement: { text: "hacked" } } })).status, 401);
  assert.equal(
    (await call("/api/settings", { method: "PATCH", cookie: cust.cookie, body: { announcement: { text: "hacked" } } })).status,
    403
  );

  // Nothing changed for the public.
  const pub = await call("/api/settings");
  assert.ok(!JSON.stringify(pub.data).includes("hacked"));
});

test("admin settings PATCH rejects unapproved image hosts and invalid payloads", async () => {
  const admin = await loginAdmin();
  const bad = await call("/api/settings", {
    method: "PATCH",
    cookie: admin.cookie,
    body: { home: { heroSlides: [{ image: { url: "https://evil.example.com/track.jpg" }, title: "Nope" }] } },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /approved source/);

  // Missing body / nothing to update → 400, not a silent success.
  assert.equal((await call("/api/settings", { method: "PATCH", cookie: admin.cookie, body: {} })).status, 400);
  // Over-limit arrays are rejected.
  const tooMany = await call("/api/settings", {
    method: "PATCH",
    cookie: admin.cookie,
    body: { announcement: { messages: Array.from({ length: 9 }, (_, i) => ({ text: `m${i}` })) } },
  });
  assert.equal(tooMany.status, 400);
});

test("turning the announcement off hides the marquee entirely; local /uploads URLs are allowed", async () => {
  const admin = await loginAdmin();
  // Local-driver upload URL (development, served by our own backend) must be accepted.
  const localImg = await call("/api/settings", {
    method: "PATCH",
    cookie: admin.cookie,
    body: { home: { festive: { image: { url: "/uploads/nil-abc123.jpg", publicId: "nil-abc123.jpg" }, active: true } } },
  });
  assert.equal(localImg.status, 200);

  const off = await call("/api/settings", {
    method: "PATCH",
    cookie: admin.cookie,
    body: { announcement: { active: false } },
  });
  assert.equal(off.status, 200);
  const pub = await call("/api/settings");
  assert.equal(pub.data.announcement, null, "inactive announcement → storefront hides the bar");
});
