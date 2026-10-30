import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  IMAGEKIT_FOLDER,
  IMAGEKIT_UPLOAD_URL,
  deleteImageKitPhoto,
  listImageKitPhotos,
  uploadToImageKit,
} from "../src/api/github.js";

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
  assert.match(form.get("fileName"), /^\d+-[a-z0-9]{4}-gold-ring\.webp$/);
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

test("lists photos through the photo service", async () => {
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ configured: true, files: [{ path: "/nilaara/products/a.png" }] });
  };

  const files = await listImageKitPhotos("tok123");

  assert.equal(seen.url, "/api/imagekit");
  assert.equal(seen.init.headers.Authorization, "Bearer tok123");
  assert.deepEqual(JSON.parse(seen.init.body), { action: "list" });
  assert.deepEqual(files, [{ path: "/nilaara/products/a.png" }]);
});

test("an unconfigured photo service has no photo list", async () => {
  globalThis.fetch = async () => jsonResponse({ configured: false });
  assert.equal(await listImageKitPhotos("tok123"), null);
});

test("deletes a photo by path and reports the server's refusal", async () => {
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ configured: true, deleted: "/nilaara/products/a.png" });
  };
  assert.equal(await deleteImageKitPhoto("/nilaara/products/a.png", "tok123"), "/nilaara/products/a.png");
  assert.deepEqual(JSON.parse(seen.init.body), { action: "delete", filePath: "/nilaara/products/a.png" });

  globalThis.fetch = async () => jsonResponse({ message: "File not found" }, 502);
  await assert.rejects(deleteImageKitPhoto("/nilaara/products/a.png", "tok123"), /File not found/);
});

test("photo management needs a GitHub session", async () => {
  await assert.rejects(listImageKitPhotos(""), /Sign in with GitHub/);
});
