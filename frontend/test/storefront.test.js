import assert from "node:assert/strict";
import { test } from "node:test";
import { freebiesLabel } from "../src/data/freebies.js";
import { hasStockCount, isLowStock, isSoldOut, stockCount } from "../src/data/inventory.js";

test("freebie copy follows the admin setting", () => {
  assert.equal(freebiesLabel({ shipping: { freeOver: 5000 } }), "Freebies over ₹5,000");
  assert.equal(freebiesLabel({ shipping: { freeOver: 7500 } }), "Freebies over ₹7,500");
});

test("no freebie line when the threshold is zero or missing", () => {
  assert.equal(freebiesLabel({ shipping: { freeOver: 0 } }), "");
  assert.equal(freebiesLabel({}), "");
  assert.equal(freebiesLabel(null), "");
});

test("a piece with no stock number stays on sale", () => {
  assert.equal(isSoldOut({ name: "saved before stock tracking" }), false);
  assert.equal(isSoldOut({ stock: "" }), false);
  assert.equal(hasStockCount({ stock: null }), false);
});

test("a tracked piece at zero is sold out", () => {
  assert.equal(isSoldOut({ stock: 0, trackInventory: true }), true);
  assert.equal(isSoldOut({ stock: 5 }), false);
  assert.equal(isSoldOut({ stock: 0, trackInventory: false }), false);
});

test("low stock uses the per-product warning level", () => {
  assert.equal(isLowStock({ stock: 3, lowStockThreshold: 5 }), true);
  assert.equal(isLowStock({ stock: 6, lowStockThreshold: 5 }), false);
  assert.equal(isLowStock({ stock: 0, lowStockThreshold: 5 }), false);
  assert.equal(isLowStock({ stock: 3, lowStockThreshold: 2 }), false);
});

test("stock count is a number or absent", () => {
  assert.equal(stockCount({ stock: "4" }), 4);
  assert.equal(stockCount({}), null);
});
