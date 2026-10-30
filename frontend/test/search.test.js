import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesQuery } from "../src/data/search.js";

const necklace = {
  id: "w2000",
  name: "Kundan Bridal Set",
  category: "necklaces",
  customTag: "Wedding Edit",
};

test("a shopper can find a piece by product ID", () => {
  assert.equal(matchesQuery(necklace, "w2000"), true);
  assert.equal(matchesQuery(necklace, "W2000"), true);
  assert.equal(matchesQuery(necklace, "2000"), true);
  assert.equal(matchesQuery(necklace, "  w2000  "), true);
  assert.equal(matchesQuery(necklace, "w2001"), false);
});

test("name, category and admin tag still match", () => {
  assert.equal(matchesQuery(necklace, "kundan"), true);
  assert.equal(matchesQuery(necklace, "necklaces"), true);
  assert.equal(matchesQuery(necklace, "wedding"), true);
  assert.equal(matchesQuery(necklace, "ring"), false);
});

test("an empty search keeps everything", () => {
  assert.equal(matchesQuery(necklace, ""), true);
  assert.equal(matchesQuery(necklace, "   "), true);
  assert.equal(matchesQuery(necklace, null), true);
});

test("a product saved with only a slug is still findable", () => {
  assert.equal(matchesQuery({ slug: "pearl-drop-earrings", name: "Pearl Drops" }, "pearl-drop"), true);
});
