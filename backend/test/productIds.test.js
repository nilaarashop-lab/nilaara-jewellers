/**
 * Integration tests: admin-assigned product IDs.
 *  - The admin panel can set the product ID; it is normalised to a URL-safe,
 *    lower-case slug and becomes the `/product/:id` key (quoted on WhatsApp).
 *  - Duplicates (against another product's id OR slug) are rejected with 409.
 *  - A blank ID auto-generates `nilaara-…`.
 *  - Renaming is done via the Mongo `_id`, so the record is not lost and the old
 *    URL stops resolving.
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

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `nilaara_sid=${cookie}` } : {}),
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

const product = (extra = {}) => ({ name: `Test Piece ${uniq()}`, price: 499, status: "published", ...extra });

test("staff can set the product ID; it is normalised and becomes the lookup key", async () => {
  const admin = await loginAdmin();
  const created = await call("/api/products", {
    method: "POST",
    cookie: admin.cookie,
    body: product({ id: " NL 001 / Bridal ", price: 499 }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.id, "nl-001-bridal");

  const found = await call("/api/products/nl-001-bridal");
  assert.equal(found.status, 200);
  assert.equal(found.data.id, "nl-001-bridal");
});

test("a blank product ID is auto-generated", async () => {
  const admin = await loginAdmin();
  const created = await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "  " }) });
  assert.equal(created.status, 201);
  assert.match(created.data.id, /^nilaara-[a-z0-9]+$/);
});

test("a duplicate product ID (or slug) is rejected with 409", async () => {
  const admin = await loginAdmin();
  const first = await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "nl-dup-1" }) });
  assert.equal(first.status, 201);

  const dup = await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "nl-dup-1" }) });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /already used/i);
});

test("renaming the product ID keeps the record and retires the old URL", async () => {
  const admin = await loginAdmin();
  const created = await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "nl-before" }) });
  assert.equal(created.status, 201);
  const id = created.data._id;

  const renamed = await call(`/api/products/${id}`, {
    method: "PUT",
    cookie: admin.cookie,
    body: { id: "nl-after" },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.id, "nl-after");

  assert.equal((await call("/api/products/nl-after")).status, 200);
  assert.equal((await call("/api/products/nl-before")).status, 404);
});

test("renaming onto an existing product ID is rejected with 409", async () => {
  const admin = await loginAdmin();
  await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "nl-taken" }) });
  const other = await call("/api/products", { method: "POST", cookie: admin.cookie, body: product({ id: "nl-other" }) });
  assert.equal(other.status, 201);

  const clash = await call(`/api/products/${other.data._id}`, {
    method: "PUT",
    cookie: admin.cookie,
    body: { id: "nl-taken" },
  });
  assert.equal(clash.status, 409);
});
