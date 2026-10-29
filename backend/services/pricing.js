/**
 * Authoritative pricing engine — the ONLY place money is calculated.
 * The browser never supplies prices; these rules run on current DB records.
 *
 * INR only. All figures rounded to whole rupees.
 *
 * Business rules (configurable via SiteSettings):
 *  - B1G1: per-product — only items tagged "B1G1 Free" participate; within
 *    each such line the cheapest units are free (floor(qty/2) per line).
 *    Enabled by settings.coupons.b1g1.enabled (OFF by default).
 *  - Promo codes: percent-off the subtotal above an optional minimum,
 *    resolved from the PromoCode collection by the order routes and passed
 *    in via opts.promo. A supplied promo always wins over auto-B1G1.
 *  - Legacy FLAT25 (settings.coupons.flat25) remains as a fallback for the
 *    hardcoded coupon string when no promo-code record resolves.
 *  - Shipping is free when (subtotal - couponOff) >= freeOver, otherwise the
 *    chosen delivery method's fee applies (single "Standard" method when no
 *    methods are configured in SiteSettings).
 *  - Tax (GST) is configurable; by default prices are MRP-inclusive as displayed
 *    on the storefront, so tax is shown as a breakdown of the total, not added on top.
 *  NB: making charges/purity are informational on this catalogue — extend here if
 *  your pricing ever becomes weight-based (gross/net weight × rate + making %).
 */

const DEFAULTS = {
  shipping: { freeOver: 999, fee: 79 },
  coupons: { flat25: { enabled: true, minSubtotal: 1000, percent: 25 }, b1g1: { enabled: false } },
  tax: { ratePct: 3, inclusive: true },
};

const r2 = (n) => Math.round(n);

/**
 * Resolves the delivery method for an order: the requested id when it exists
 * and is enabled, otherwise the first enabled method, otherwise the legacy
 * flat-fee default. Returns null when nothing is configured (no fee/ETA shown).
 */
function resolveShippingMethod(settings = {}, methodId = "") {
  const configured = (settings.shipping?.methods || []).filter((m) => m && m.enabled !== false && typeof m.fee === "number");
  if (!configured.length) return null;
  return configured.find((m) => m.id === methodId) || configured[0];
}

/** A product participates in B1G1 only when explicitly tagged by the admin. */
const isB1G1Item = (i) => String(i.tag || "").trim().toLowerCase() === "b1g1 free";

/**
 * @param {Array<{id?:string,name?:string,price:number,mrp?:number,qty:number,tag?:string}>} items
 * @param {string} coupon  "" | promo code (resolved via opts.promo) | "B1G1" | "FLAT25"
 * @param {{shipping?:object,coupons?:object,tax?:object}} settings
 * @param {{shippingMethodId?:string, promo?:{code:string,percent:number,minSubtotal?:number}}} [opts]
 */
function computeTotals(items, coupon = "", settings = {}, opts = {}) {
  const ship = { ...DEFAULTS.shipping, ...(settings.shipping || {}) };
  const method = resolveShippingMethod(settings, opts.shippingMethodId || "");
  const cou = {
    flat25: { ...DEFAULTS.coupons.flat25, ...(settings.coupons?.flat25 || {}) },
    b1g1: { ...DEFAULTS.coupons.b1g1, ...(settings.coupons?.b1g1 || {}) },
  };
  const tax = { ...DEFAULTS.tax, ...(settings.tax || {}) };

  const count = items.reduce((s, i) => s + i.qty, 0);
  const sub = r2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const mrpSub = r2(items.reduce((s, i) => s + (i.mrp || i.price) * i.qty, 0));
  const mrpDiscount = Math.max(0, mrpSub - sub);

  // B1G1: tagged products only, cheapest units free within each line.
  let b1g1Off = 0;
  if (cou.b1g1.enabled) {
    b1g1Off = r2(items.reduce((s, i) => (isB1G1Item(i) ? s + Math.floor(i.qty / 2) * i.price : s), 0));
  }
  // Promo code (resolved from DB by the route) — percent off the subtotal.
  const promo = opts.promo || null;
  let promoOff = 0;
  if (promo && sub >= Number(promo.minSubtotal || 0)) {
    promoOff = r2(sub * (Number(promo.percent) / 100));
  }
  // Legacy settings-driven FLAT25 (fallback for the hardcoded string).
  let flatOff = 0;
  if (cou.flat25.enabled && sub >= Number(cou.flat25.minSubtotal)) {
    flatOff = r2(sub * (Number(cou.flat25.percent) / 100));
  }

  const c = String(coupon || "").toUpperCase();
  let couponOff = 0;
  let appliedCoupon = "";
  if (promo && promoOff > 0) {
    couponOff = promoOff;
    appliedCoupon = promo.code;
  } else if (c === "B1G1" && b1g1Off > 0) {
    couponOff = b1g1Off;
    appliedCoupon = "B1G1";
  } else if (c === "FLAT25" && flatOff > 0) {
    couponOff = flatOff;
    appliedCoupon = "FLAT25";
  } else if (!coupon && b1g1Off > 0) {
    // Auto-apply B1G1 when the customer selected no promo and it is enabled.
    couponOff = b1g1Off;
    appliedCoupon = "B1G1";
  }
  couponOff = Math.min(couponOff, sub); // never negative totals

  const afterCoupon = sub - couponOff;
  // Sitewide free-shipping threshold wins; otherwise the chosen method's fee
  // (legacy flat fee when no methods are configured).
  const methodFee = method ? Number(method.fee) : Number(ship.fee);
  const shipping = sub === 0 ? 0 : afterCoupon >= Number(ship.freeOver) ? 0 : methodFee;
  const taxable = afterCoupon + shipping;

  const rate = Number(tax.ratePct) || 0;
  let taxAmount, total;
  if (tax.inclusive) {
    taxAmount = rate > 0 ? r2((taxable * rate) / (100 + rate)) : 0;
    total = taxable;
  } else {
    taxAmount = rate > 0 ? r2((taxable * rate) / 100) : 0;
    total = taxable + taxAmount;
  }

  return {
    items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, mrp: i.mrp, qty: i.qty, lineTotal: r2(i.price * i.qty) })),
    sub,
    mrpDiscount,
    coupon: appliedCoupon,
    couponOff,
    shipping,
    shippingMethod: method
      ? { methodId: method.id, label: method.label, etaMinDays: method.etaMinDays ?? null, etaMaxDays: method.etaMaxDays ?? null }
      : null,
    tax: taxAmount,
    taxRatePct: rate,
    total: Math.max(0, total),
    count,
  };
}

module.exports = { computeTotals, resolveShippingMethod, DEFAULTS };
