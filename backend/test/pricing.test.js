/** Authoritative pricing engine rules. */
const { test } = require("node:test");
const assert = require("node:assert");
const { computeTotals } = require("../services/pricing");

test("single item: free shipping over ₹999, tax shown as inclusive breakdown", () => {
  const t = computeTotals([{ price: 1000, mrp: 2000, qty: 1 }]);
  assert.equal(t.sub, 1000);
  assert.equal(t.shipping, 0);
  assert.equal(t.total, 1000); // tax-inclusive total stays the payable amount
  assert.ok(t.tax > 0 && t.tax < 100);
});

const B1G1_ON = { coupons: { b1g1: { enabled: true } } };

test("B1G1 frees floor(qty/2) units per tagged line when enabled", () => {
  const t = computeTotals(
    [
      { price: 500, mrp: 900, qty: 2, tag: "B1G1 Free" },
      { price: 700, mrp: 1200, qty: 1, tag: "B1G1 Free" },
    ],
    "B1G1",
    B1G1_ON
  );
  assert.equal(t.coupon, "B1G1");
  assert.equal(t.couponOff, 500); // one free unit from the pair
  assert.equal(t.sub, 1700);
  assert.equal(t.shipping, 0); // after discount still ≥ ₹999
  assert.equal(t.total, 1200);
});

test("B1G1 frees one unit per pair (qty 5 → 2 free)", () => {
  const t = computeTotals([{ price: 400, mrp: 800, qty: 5, tag: "B1G1 Free" }], "B1G1", B1G1_ON);
  assert.equal(t.couponOff, 800); // floor(5/2) = 2 free units
});

test("B1G1 is off by default and skips untagged products", () => {
  const tagged = [{ price: 400, mrp: 800, qty: 2, tag: "B1G1 Free" }];
  assert.equal(computeTotals(tagged, "B1G1").couponOff, 0); // master switch defaults OFF
  assert.equal(computeTotals([{ price: 400, mrp: 800, qty: 2 }], "B1G1", B1G1_ON).couponOff, 0); // not tagged
});

test("FLAT25 applies only at/above the minimum subtotal", () => {
  const ok = computeTotals([{ price: 2000, mrp: 3000, qty: 1 }], "FLAT25");
  assert.equal(ok.couponOff, 500);
  assert.equal(ok.total, 1500);
  const below = computeTotals([{ price: 800, mrp: 1200, qty: 1 }], "FLAT25");
  assert.equal(below.couponOff, 0);
});

test("shipping fee applies below the free threshold", () => {
  const t = computeTotals([{ price: 500, mrp: 900, qty: 1 }]);
  assert.equal(t.shipping, 79);
  assert.equal(t.total, 579);
});

test("unknown coupons are ignored", () => {
  const t = computeTotals([{ price: 500, mrp: 900, qty: 1 }], "HACK100");
  assert.equal(t.couponOff, 0);
  assert.equal(t.coupon, "");
});

test("settings override the defaults (configured from the admin panel)", () => {
  const t = computeTotals([{ price: 1500, mrp: 2000, qty: 1 }], "", {
    shipping: { freeOver: 5000, fee: 49 },
    tax: { ratePct: 18, inclusive: true },
  });
  assert.equal(t.shipping, 49);
  assert.equal(t.taxRatePct, 18);
  assert.equal(t.total, 1549);
});
