/** Order status workflow rules. */
const { test } = require("node:test");
const assert = require("node:assert");
const { assertTransition } = require("../lib/orderStatus");

test("forward transitions are allowed", () => {
  assert.doesNotThrow(() => assertTransition("placed", "packed"));
  assert.doesNotThrow(() => assertTransition("packed", "shipped"));
  assert.doesNotThrow(() => assertTransition("shipped", "delivered"));
});

test("backwards and out-of-order transitions are rejected", () => {
  assert.throws(() => assertTransition("placed", "delivered"), /Cannot move order/);
  assert.throws(() => assertTransition("delivered", "placed"), /Cannot move order/);
  assert.throws(() => assertTransition("cancelled", "packed"), /Cannot move order/);
});

test("customers can only cancel early-stage orders", () => {
  assert.doesNotThrow(() => assertTransition("placed", "cancelled", { byCustomer: true }));
  assert.doesNotThrow(() => assertTransition("packed", "cancelled", { byCustomer: true }));
  assert.throws(() => assertTransition("shipped", "cancelled", { byCustomer: true }), /no longer be cancelled/);
});
