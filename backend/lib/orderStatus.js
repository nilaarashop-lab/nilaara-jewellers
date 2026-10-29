/**
 * Controlled order-status workflow.
 * Forward progress only, except cancellations/refunds which are explicit branches.
 */
const { HttpError } = require("../lib/apiError");

const TRANSITIONS = {
  placed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned", "refunded"],
  cancelled: [], // terminal (restock already done)
  returned: ["refunded"],
  refunded: [],
};

const CUSTOMER_CANCELLABLE = ["placed", "packed"];

function assertTransition(from, to, { byCustomer = false } = {}) {
  // Customer cancellations are checked first so the error message is precise.
  if (byCustomer && to === "cancelled" && !CUSTOMER_CANCELLABLE.includes(from)) {
    throw new HttpError(409, "This order can no longer be cancelled.");
  }
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new HttpError(409, `Cannot move order from "${from}" to "${to}".`);
  }
}

module.exports = { TRANSITIONS, CUSTOMER_CANCELLABLE, assertTransition };
