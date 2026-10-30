import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  CONTENT_EVENT,
  RAW_ROOT,
  mediaUrl,
  notifyContentUpdated,
} from "../src/data/repo.js";
import { loadBuildContent, loadCommitContent } from "../src/data/liveContent.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("admin uploads resolve to the committed raw file", () => {
  assert.equal(
    mediaUrl("/uploads/123-photo.webp"),
    `${RAW_ROOT}/frontend/public/uploads/123-photo.webp`
  );
  assert.equal(mediaUrl("https://ik.imagekit.io/x/y.jpg"), "https://ik.imagekit.io/x/y.jpg");
  assert.equal(mediaUrl(""), "");
});

test("a content save stores the commit for other tabs", () => {
  const writes = [];
  globalThis.window = {
    localStorage: { setItem: (key, value) => writes.push([key, value]) },
    dispatchEvent: () => {},
  };
  try {
    notifyContentUpdated("abc123");
  } finally {
    delete globalThis.window;
  }
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], CONTENT_EVENT);
  const detail = JSON.parse(writes[0][1]);
  assert.equal(detail.commit, "abc123");
  assert.match(String(detail.at), /^\d+$/);
});

test("the deployed snapshot is fetched from /content with cache bypass", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("products.json")) {
      return jsonResponse({
        _commit: "build-sha",
        products: [{ id: "nl-001", name: "Kundan", status: "published" }],
      });
    }
    return jsonResponse({ announcement: { active: true, text: "Hello" } });
  };

  const live = await loadBuildContent();

  assert.equal(live.products._commit, "build-sha");
  assert.equal(live.products.products[0].id, "nl-001");
  assert.equal(live.settings.announcement.text, "Hello");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.url, /^\/content\/.+\.json\?v=\d+$/);
    assert.equal(call.options.cache, "no-store");
  }
});

test("an exact commit is used for instant admin updates", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("products.json")) {
      return jsonResponse({ products: [{ id: "nl-002", name: "Test3", status: "published" }] });
    }
    return jsonResponse({ announcement: { active: false } });
  };

  const live = await loadCommitContent("896e647");

  assert.equal(live.products.products[0].id, "nl-002");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(
      call.url,
      /^https:\/\/raw\.githubusercontent\.com\/nilaarashop-lab\/nilaara-jewellers\/896e647\/frontend\/src\/content\//
    );
    assert.match(call.url, /\?v=\d+$/);
  }
});

test("a failed snapshot request leaves that file on the bundled fallback", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("products.json")) throw new Error("offline");
    return jsonResponse({ announcement: { active: false } });
  };

  const live = await loadBuildContent();

  assert.equal(live.products, null);
  assert.deepEqual(live.settings, { announcement: { active: false } });
});
