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

const withHeaders = (data, status = 200, requestId = "") => ({
  ...jsonResponse(data, status),
  headers: { get: (name) => (name.toLowerCase() === "x-github-request-id" ? requestId : null) },
});

test("a 500 from GitHub is retried and the retry result is used", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? withHeaders({ message: "Server Error" }, 500, "ABC123")
      : withHeaders({ ok: true });
  };

  const result = await githubRequest("/repos/x/y/contents/a", { token: "t", attempts: 3 });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("a 500 with no retries left names GitHub and the request id", async () => {
  globalThis.fetch = async () => withHeaders({ message: "Server Error" }, 500, "REQ-9001");

  await assert.rejects(() => githubRequest("/user", { token: "t" }), (error) => {
    assert.equal(error.status, 500);
    assert.match(error.message, /temporary server error \(500\)/);
    assert.match(error.message, /REQ-9001/);
    assert.equal(error.details.requestId, "REQ-9001");
    return true;
  });
});

test("a dropped connection is retried, then reported as a connection problem", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Failed to fetch");
    return jsonResponse({ ok: true });
  };
  assert.deepEqual(await githubRequest("/user", { token: "t", attempts: 2 }), { ok: true });
  assert.equal(calls, 2);

  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(() => githubRequest("/user", { token: "t", attempts: 2 }), (error) => {
    assert.equal(error.status, 0);
    assert.match(error.message, /Couldn't reach GitHub/);
    return true;
  });
});

test("auth failures are never retried", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ message: "Bad credentials" }, 401);
  };

  await assert.rejects(() => githubRequest("/user", { token: "t", attempts: 3 }));
  assert.equal(calls, 1);
});
