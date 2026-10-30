import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import handler, { deletePhoto, isManagedPhotoPath, listFolderPhotos } from "../api/imagekit.js";

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const photo = (name) => ({
  filePath: `/nilaara/products/${name}`,
  url: `https://ik.imagekit.io/w4bq6axnq/nilaara/products/${name}`,
  name,
  size: 2048,
  createdAt: "2026-10-01T09:00:00Z",
});

test("lists the storefront folder with the private key as basic auth", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return json([photo("a.png")]);
  };

  const files = await listFolderPhotos({ privateKey: "priv_x", fetchImpl });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.imagekit\.io\/v1\/files\?/);
  assert.match(calls[0].url, /path=%2Fnilaara%2Fproducts/);
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from("priv_x:").toString("base64")}`);
  assert.deepEqual(files, [
    {
      path: "/nilaara/products/a.png",
      url: "https://ik.imagekit.io/w4bq6axnq/nilaara/products/a.png",
      name: "a.png",
      size: 2048,
      createdAt: "2026-10-01T09:00:00Z",
    },
  ]);
});

test("walks every page until ImageKit returns a short one", async () => {
  const skips = [];
  const fetchImpl = async (url) => {
    const skip = Number(new URL(url).searchParams.get("skip"));
    skips.push(skip);
    return json(skip === 0 ? Array.from({ length: 100 }, (_, i) => photo(`p${i}.png`)) : [photo("last.png")]);
  };

  const files = await listFolderPhotos({ privateKey: "priv_x", fetchImpl });

  assert.deepEqual(skips, [0, 100]);
  assert.equal(files.length, 101);
  assert.equal(files.at(-1).name, "last.png");
});

test("a rejected list request reports ImageKit's status", async () => {
  const fetchImpl = async () => json({ message: "Unauthorized" }, 401);
  await assert.rejects(listFolderPhotos({ privateKey: "priv_x", fetchImpl }), /couldn't list photos \(401\)/);
});

test("only photos inside the storefront folder can be deleted", () => {
  assert.equal(isManagedPhotoPath("/nilaara/products/a.png"), true);
  assert.equal(isManagedPhotoPath("/nilaara/products/../secrets.png"), false);
  assert.equal(isManagedPhotoPath("/nilaara/other/a.png"), false);
  assert.equal(isManagedPhotoPath("https://ik.imagekit.io/w4bq6axnq/nilaara/products/a.png"), false);
  assert.equal(isManagedPhotoPath(""), false);
});

test("refuses a path outside the folder before calling ImageKit", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return json({});
  };
  await assert.rejects(deletePhoto({ privateKey: "priv_x", filePath: "/nilaara/other/a.png", fetchImpl }), /not in the storefront folder/);
  assert.equal(called, false);
});

test("deletes one photo by path", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return json({});
  };

  const result = await deletePhoto({ privateKey: "priv_x", filePath: "/nilaara/products/old one.png", fetchImpl });

  assert.deepEqual(result, { deleted: "/nilaara/products/old one.png" });
  assert.equal(calls[0].init.method, "DELETE");
  assert.match(calls[0].url, /filePath=%2Fnilaara%2Fproducts%2Fold%20one\.png$/);
});

test("surfaces ImageKit's message when a delete fails", async () => {
  const fetchImpl = async () => json({ message: "File not found" }, 404);
  await assert.rejects(deletePhoto({ privateKey: "priv_x", filePath: "/nilaara/products/gone.png", fetchImpl }), /File not found/);
});

/* ── the endpoint itself ─────────────────────────────────────────────── */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.IMAGEKIT_PRIVATE_KEY;
  delete process.env.IMAGEKIT_PUBLIC_KEY;
});

const fakeRes = () => ({
  statusCode: 0,
  setHeader() {},
  end(body) {
    this.body = body;
  },
});

const staffToken = (handlerFn) => async (url, init) => {
  if (String(url).startsWith("https://api.github.com/repos/")) return json({ permissions: { push: true } });
  return handlerFn(url, init);
};

const configure = () => {
  process.env.IMAGEKIT_PRIVATE_KEY = "priv_x";
  process.env.IMAGEKIT_PUBLIC_KEY = "public_x";
};

test("an action of list returns the folder's photos", async () => {
  configure();
  globalThis.fetch = staffToken(async () => json([photo("a.png")]));
  const res = fakeRes();

  await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { action: "list" } }, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.configured, true);
  assert.equal(body.folder, "/nilaara/products");
  assert.deepEqual(body.files.map((f) => f.path), ["/nilaara/products/a.png"]);
});

test("an action of delete passes the path through to ImageKit", async () => {
  configure();
  const seen = [];
  globalThis.fetch = staffToken(async (url, init) => {
    seen.push({ url: String(url), method: init?.method });
    return json({});
  });
  const res = fakeRes();

  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: JSON.stringify({ action: "delete", filePath: "/nilaara/products/old.png" }),
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).deleted, "/nilaara/products/old.png");
  assert.equal(seen.at(-1).method, "DELETE");
});

test("deleting outside the storefront folder is a 400", async () => {
  configure();
  globalThis.fetch = staffToken(async () => json({}));
  const res = fakeRes();

  await handler(
    { method: "POST", headers: { authorization: "Bearer tok" }, body: { action: "delete", filePath: "/elsewhere/a.png" } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).message, /storefront folder/);
});

test("a request without an action still signs an upload", async () => {
  configure();
  globalThis.fetch = staffToken(async () => json({}));
  const res = fakeRes();

  await handler({ method: "POST", headers: { authorization: "Bearer tok" } }, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(typeof body.signature, "string");
  assert.equal(body.publicKey, "public_x");
});
