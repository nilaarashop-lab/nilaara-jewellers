import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { IMAGEKIT_UPLOAD_URL } from "../src/api/github.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const photo = () =>
  new File([new Uint8Array([65, 66, 67])], "Gold Ring.webp", { type: "image/webp" });

const REPO_PATH = "/repos/nilaarashop-lab/nilaara-jewellers";
const month = () => new Date().toISOString().slice(0, 7);

/** Each call loads a fresh module so the "branch exists" cache starts empty. */
const freshApi = () => import(`../src/api/github.js?backup=${Math.random()}`);

const existingBranch = (url) => url === `https://api.github.com${REPO_PATH}/git/ref/heads/backups`;

test("creates the backups branch from main before the first archive", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body });
    if (existingBranch(url)) return jsonResponse({ message: "Not Found" }, 404);
    if (url.endsWith(`${REPO_PATH}/git/ref/heads/main`)) return jsonResponse({ object: { sha: "main-sha" } });
    if (url.endsWith(`${REPO_PATH}/git/refs`)) return jsonResponse({ ref: "refs/heads/backups" }, 201);
    if (url.includes("/contents/backups/photos/")) return jsonResponse({ content: { sha: "c1" } }, 201);
    throw new Error(`unexpected ${url}`);
  };
  const api = await freshApi();

  const name = "2026-10-31-ring.webp";
  const path = await api.backupPhoto(photo(), { name, token: "tok" });

  assert.equal(path, `backups/photos/${month()}/${name}`);
  const created = calls.find((c) => c.url.endsWith("/git/refs"));
  assert.equal(created.method, "POST");
  assert.deepEqual(JSON.parse(created.body), { ref: "refs/heads/backups", sha: "main-sha" });

  const put = calls.find((c) => c.url.includes("/contents/backups/photos/"));
  assert.equal(put.method, "PUT");
  const body = JSON.parse(put.body);
  assert.equal(body.branch, "backups");
  assert.equal(body.message, `Backup: photo ${name}`);
  assert.equal(Buffer.from(body.content, "base64").toString(), "ABC");
});

test("reuses an existing backups branch", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    if (existingBranch(url)) return jsonResponse({ object: { sha: "b" } });
    if (url.includes("/contents/backups/photos/")) return jsonResponse({ content: { sha: "c1" } }, 201);
    throw new Error(`unexpected ${url}`);
  };
  const api = await freshApi();

  await api.backupPhoto(photo(), { name: "one.webp", token: "tok" });

  assert.equal(calls.filter((c) => c.url.endsWith("/git/refs")).length, 0);
  assert.equal(calls.filter((c) => c.method === "PUT").length, 1);
});

test("a parallel branch creation (422) does not stop the archive", async () => {
  globalThis.fetch = async (url, init = {}) => {
    if (existingBranch(url)) return jsonResponse({ message: "Not Found" }, 404);
    if (url.endsWith(`${REPO_PATH}/git/ref/heads/main`)) return jsonResponse({ object: { sha: "main-sha" } });
    if (url.endsWith(`${REPO_PATH}/git/refs`)) return jsonResponse({ message: "Reference already exists" }, 422);
    if (url.includes("/contents/backups/photos/")) return jsonResponse({ content: { sha: "c1" } }, 201);
    throw new Error(`unexpected ${url} ${init.method}`);
  };
  const api = await freshApi();

  const path = await api.backupPhoto(photo(), { name: "two.webp", token: "tok" });
  assert.match(path, /^backups\/photos\/.+\/two\.webp$/);
});

test("archives a product snapshot with its details and reason", async () => {
  let seen = null;
  globalThis.fetch = async (url, init = {}) => {
    if (existingBranch(url)) return jsonResponse({ object: { sha: "b" } });
    if (url.includes("/contents/backups/products/")) {
      seen = { url, body: JSON.parse(init.body) };
      return jsonResponse({ content: { sha: "p1" } }, 201);
    }
    throw new Error(`unexpected ${url}`);
  };
  const api = await freshApi();

  const product = { id: "w2000", name: "test2", price: 799, images: ["https://ik.imagekit.io/x/a.webp"] };
  const path = await api.backupProductSnapshot(product, { reason: "deleted", commit: "abc123", token: "tok" });

  assert.match(path, /^backups\/products\/w2000\/.+-deleted\.json$/);
  assert.equal(seen.body.branch, "backups");
  const doc = JSON.parse(Buffer.from(seen.body.content, "base64").toString("utf8"));
  assert.equal(doc.reason, "deleted");
  assert.equal(doc.commit, "abc123");
  assert.deepEqual(doc.product, product);
  assert.ok(doc.backedUpAt);
});

test("a photo is not sent to ImageKit when its backup fails", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    if (url === "/api/imagekit") {
      return jsonResponse({ configured: true, signature: "sig", token: "t", expire: 1, publicKey: "k" });
    }
    if (existingBranch(url)) return jsonResponse({ object: { sha: "b" } });
    if (url.includes("/contents/backups/photos/")) return jsonResponse({ message: "boom" }, 500);
    throw new Error(`unexpected ${url}`);
  };
  const api = await freshApi();

  await assert.rejects(
    api.uploadImage(photo(), "tok"),
    /backup copy could not be saved/i
  );
  assert.equal(calls.some((c) => c.url === IMAGEKIT_UPLOAD_URL), false);
});

test("the archived photo and the ImageKit copy share one name, backup first", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body });
    if (url === "/api/imagekit") {
      return jsonResponse({ configured: true, signature: "sig", token: "t", expire: 1, publicKey: "k" });
    }
    if (existingBranch(url)) return jsonResponse({ object: { sha: "b" } });
    if (url.includes("/contents/backups/photos/")) return jsonResponse({ content: { sha: "c1" } }, 201);
    if (url === IMAGEKIT_UPLOAD_URL) {
      const form = init.body;
      return jsonResponse({
        url: `https://ik.imagekit.io/w4bq6axnq/nilaara/products/${form.get("fileName")}`,
        filePath: `/nilaara/products/${form.get("fileName")}`,
        name: form.get("fileName"),
      });
    }
    throw new Error(`unexpected ${url}`);
  };
  const api = await freshApi();

  const result = await api.uploadImage(photo(), "tok");

  const backupCall = calls.findIndex((c) => c.url.includes("/contents/backups/photos/"));
  const imageKitCall = calls.findIndex((c) => c.url === IMAGEKIT_UPLOAD_URL);
  assert.ok(backupCall >= 0 && imageKitCall > backupCall, "backup must run before the upload");

  const backupName = calls[backupCall].url.split("/").pop();
  const uploaded = calls[imageKitCall].body.get("fileName");
  assert.equal(backupName, uploaded);
  assert.equal(result.name, uploaded);
  assert.match(uploaded, /^\d+-[a-z0-9]{4}-gold-ring\.webp$/);
});
