import assert from "node:assert/strict";
import { test } from "node:test";
import { findIdClash, normalizeId } from "../src/data/productId.js";

const catalogue = [
  { id: "w2000", slug: "w2000", name: "white diamond" },
  { id: "nl-014", slug: "nl-014", name: "Ring Mala" },
  { slug: "legacy-7", name: "no id stored" },
];

test("an ID is written the way the storefront reads it", () => {
  assert.equal(normalizeId("  NL 007_Replica  "), "nl-007-replica");
  assert.equal(normalizeId("W2000"), "w2000");
  assert.equal(normalizeId("!!!"), "");
});

test("a free ID saves without complaint", () => {
  assert.equal(findIdClash(catalogue, "nl-021"), "");
  assert.equal(findIdClash(catalogue, ""), "");
});

test("an ID another product already holds is reported", () => {
  assert.equal(findIdClash(catalogue, "nl-014"), "nl-014");
});

test("letter case and stray spaces around the ID cannot hide a clash", () => {
  assert.equal(findIdClash(catalogue, " W2000 "), "w2000");
  // A space inside the ID becomes a dash, so this really is a different piece.
  assert.equal(findIdClash(catalogue, "W 2000"), "");
});

test("editing a product never clashes with itself", () => {
  assert.equal(findIdClash(catalogue, "w2000", "w2000"), "");
  assert.equal(findIdClash(catalogue, "nl-014", "w2000"), "nl-014");
});

test("a record with only a slug still owns that address", () => {
  assert.equal(findIdClash(catalogue, "legacy-7"), "legacy-7");
  assert.equal(findIdClash(catalogue, "legacy-7", "legacy-7"), "");
});
