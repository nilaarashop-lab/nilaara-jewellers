import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { RAW_ROOT, mediaUrl } from "../src/data/repo.js";
import { loadLiveContent } from "../src/data/liveContent.js";

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

test("live content reads both JSON files with cache bypass", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("products.json")) {
      return jsonResponse({ products: [{ id: "nl-001", name: "Kundan", status: "published" }] });
    }
    return jsonResponse({ announcement: { active: true, text: "Hello" } });
  };

  const live = await loadLiveContent();

  assert.equal(live.products.products[0].id, "nl-001");
  assert.equal(live.settings.announcement.text, "Hello");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.url, /^https:\/\/raw\.githubusercontent\.com\//);
    assert.match(call.url, /\?v=\d+$/);
    assert.equal(call.options.cache, "no-store");
  }
});

test("a failed request leaves that file on the bundled fallback", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("products.json")) throw new Error("offline");
    return jsonResponse({ announcement: { active: false } });
  };

  const live = await loadLiveContent();

  assert.equal(live.products, null);
  assert.deepEqual(live.settings, { announcement: { active: false } });
});
