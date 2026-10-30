import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { IMAGEKIT_FOLDER, IMAGEKIT_UPLOAD_URL, uploadToImageKit } from "../src/api/github.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const auth = { publicKey: "public_x", token: "tok123", expire: 1_700_000_600, signature: "sig456" };
const photo = () =>
  new File([new Uint8Array([1, 2, 3, 4])], "Gold Ring.webp", { type: "image/webp" });

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("uploads the signed form to ImageKit and returns its URL", async () => {
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({
      url: "https://ik.imagekit.io/w4bq6axnq/nilaara/products/ring.webp",
      filePath: "/nilaara/products/ring.webp",
      name: "ring.webp",
    });
  };

  const result = await uploadToImageKit(photo(), auth);

  assert.equal(seen.url, IMAGEKIT_UPLOAD_URL);
  assert.equal(seen.init.method, "POST");
  const form = seen.init.body;
  assert.equal(form.get("folder"), IMAGEKIT_FOLDER);
  assert.equal(form.get("useUniqueFileName"), "true");
  assert.equal(form.get("publicKey"), "public_x");
  assert.equal(form.get("token"), "tok123");
  assert.equal(form.get("expire"), "1700000600");
  assert.equal(form.get("signature"), "sig456");
  assert.match(form.get("fileName"), /^\d+-[a-z0-9]{4}-gold-ring$/);
  assert.equal(form.get("file").type, "image/webp");

  assert.deepEqual(result, {
    url: "https://ik.imagekit.io/w4bq6axnq/nilaara/products/ring.webp",
    path: "/nilaara/products/ring.webp",
    name: "ring.webp",
  });
});

test("surfaces ImageKit's own error message", async () => {
  globalThis.fetch = async () => jsonResponse({ message: "Invalid signature" }, 401);
  await assert.rejects(uploadToImageKit(photo(), auth), /Invalid signature/);
});

test("a dropped connection reports the network error", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(uploadToImageKit(photo(), auth), /Couldn't reach ImageKit/);
});
