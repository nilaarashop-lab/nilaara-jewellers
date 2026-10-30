import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  BRANCH,
  PRODUCTS_PATH,
  REPO,
  decodeBase64Utf8,
  encodeBase64Utf8,
  githubRequest,
  loadCatalogue,
  previewUrl,
  saveCatalogue,
} from "../src/api/github.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("base64 helpers round-trip UTF-8 text", () => {
  const sample = '{"name":"Kundan Choker ₹1,149 ✨","note":"café – naïve"}';
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(sample)), sample);
});

test("loadCatalogue reads main, sends the token, and decodes the file", async () => {
  const doc = { products: [{ id: "nl-001", name: "Kundan ₹1,149 ✨" }] };
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    return jsonResponse({
      type: "file",
      path: PRODUCTS_PATH,
      sha: "old-sha",
      content: encodeBase64Utf8(`${JSON.stringify(doc, null, 2)}\n`),
    });
  };

  const loaded = await loadCatalogue("token-123");

  assert.equal(loaded.sha, "old-sha");
  assert.deepEqual(loaded.doc, doc);
  assert.equal(call.url, `https://api.github.com/repos/${REPO}/contents/${PRODUCTS_PATH}?ref=${BRANCH}`);
  assert.equal(call.options.headers.Authorization, "Bearer token-123");
  assert.equal(call.options.headers["X-GitHub-Api-Version"], "2022-11-28");
});

test("saveCatalogue commits pretty JSON with the loaded sha", async () => {
  const doc = { products: [{ id: "nl-001", name: "Kundan ₹1,149 ✨" }] };
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "commit-sha" } });
  };

  const saved = await saveCatalogue(doc, "old-sha", "Admin: test", "token-123");

  assert.deepEqual(saved, { sha: "new-sha", commit: "commit-sha" });
  assert.equal(call.url, `https://api.github.com/repos/${REPO}/contents/${PRODUCTS_PATH}`);
  assert.equal(call.options.method, "PUT");

  const body = JSON.parse(call.options.body);
  assert.equal(body.branch, BRANCH);
  assert.equal(body.sha, "old-sha");
  assert.equal(body.message, "Admin: test");
  assert.deepEqual(JSON.parse(decodeBase64Utf8(body.content)), doc);
  assert.ok(decodeBase64Utf8(body.content).endsWith("\n"));
});

test("401 responses are reported as an expired session", async () => {
  globalThis.fetch = async () => jsonResponse({ message: "Bad credentials" }, 401);

  await assert.rejects(() => githubRequest("/user", { token: "expired" }), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /session expired/i);
    return true;
  });
});

test("uploaded images preview from the committed repository path", () => {
  assert.equal(
    previewUrl("/uploads/123-photo.webp"),
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/frontend/public/uploads/123-photo.webp`
  );
  assert.equal(previewUrl("https://ik.imagekit.io/x/y.jpg"), "https://ik.imagekit.io/x/y.jpg");
  assert.equal(previewUrl(""), "");
});
