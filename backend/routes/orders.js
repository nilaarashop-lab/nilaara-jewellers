/**
 * Order routes.
 *  - POST /            checkout — LOGIN REQUIRED (guests are sent to /login by
 *                      the UI; the server enforces it here). PRICES ARE
 *                      RECOMPUTED ON THE SERVER from current product records —
 *                      browser totals are ignored.
 *  - POST /preview      server-side total recalculation for checkout screens
 *                      (no order created).
 *  - GET  /            admin/staff list.
 *  - PATCH /:id        admin/staff status transitions (controlled workflow).
 *  - GET  /:id         owner (session) — no public PII dump.
 *  - GET  /mine        the signed-in customer's own history (?view=live|old).
 */
const express = require("express");
const z = require("zod");
const mongoose = require("mongoose");
const env = require("../config/env");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const PromoCode = require("../models/PromoCode");
const SiteSettings = require("../models/SiteSettings");
const { validate } = require("../middleware/validate");
const { requireRole, requireUser } = require("../middleware/auth");
const { asyncHandler, fail } = require("../lib/apiError");
const { computeTotals, resolveShippingMethod } = require("../services/pricing");
const { findStorefrontProducts, stockCap } = require("../services/catalog");
const { reserveStock, releaseStock } = require("../services/inventory");
const { assertTransition } = require("../lib/orderStatus");
const { createLimiter } = require("../lib/rateLimit");

const router = express.Router();
const isOid = (s) => mongoose.Types.ObjectId.isValid(s);
const checkoutLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 20, message: "Too many checkout attempts. Please try again shortly." });

const orderNumber = () => `NIL-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;

/**
 * Resolves a promo code against the PromoCode collection for a given subtotal.
 * "B1G1"/"FLAT25" legacy strings are handled inside computeTotals and return
 * null here. Unknown/inactive/over-minimum codes are rejected outright.
 */
async function resolvePromo(coupon, sub) {
  const c = String(coupon || "").trim().toUpperCase();
  if (!c || c === "B1G1" || c === "FLAT25") return null;
  const p = await PromoCode.findOne({ code: c });
  if (!p) fail(400, "That promo code does not exist.");
  if (!p.isUsable(sub)) fail(400, `Promo "${p.code}" is not available — it may be inactive, need a minimum of ₹${p.minSubtotal}, or be used up.`);
  return { code: p.code, percent: p.percent, minSubtotal: p.minSubtotal || 0, maxUses: p.maxUses };
}

const checkoutSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(120), qty: z.number().int().min(1).max(10) })).min(1).max(30),
  coupon: z.string().max(20).optional(),
  payment: z.enum(["cod", "razorpay"]).default("cod"),
  shippingMethod: z.string().max(40).optional(), // id of a configured delivery method
  customer: z.object({
    name: z.string().min(2).max(120),
    phone: z.string().regex(/^[0-9]{10}$/, "Phone must be 10 digits"),
    address: z.string().min(5).max(500),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(60).optional(),
    pin: z.string().regex(/^[0-9]{6}$/, "Pincode must be 6 digits"),
    notes: z.string().max(300).optional(), // delivery instructions
  }),
});

// POST /api/orders — checkout (session required)
router.post(
  "/",
  requireUser, // guests cannot place orders — the UI redirects them to /login
  checkoutLimiter,
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const { items, coupon, payment, shippingMethod, customer } = req.body;

    if (payment === "razorpay" && !env.paymentsEnabled()) fail(400, "Online payment is not available yet — please choose Cash on Delivery.");

    // 1. Load the real products (published only) — lean() so we can see which
    //    legacy records have no stock field (treated as untracked).
    const ids = items.map((i) => i.id);
    const docs = await Product.find({
      $and: [
        { $or: [{ id: { $in: ids } }, { slug: { $in: ids } }, { _id: { $in: ids.filter(isOid) } }] },
        { $or: [{ status: "published" }, { status: { $exists: false } }] },
      ],
    }).lean();

    const byKey = new Map();
    for (const d of docs) {
      byKey.set(String(d.id), d);
      if (d.slug) byKey.set(String(d.slug), d);
      byKey.set(String(d._id), d);
    }
    const lines = [];
    for (const i of items) {
      const p = byKey.get(String(i.id));
      if (!p) fail(400, `Product "${i.id}" is no longer available.`);
      lines.push({
        _id: p._id,
        id: p.id || String(p._id),
        name: p.name,
        sku: p.sku,
        image: p.images?.[0]?.url || "",
        price: p.price,
        mrp: p.mrp || p.price,
        qty: i.qty,
        tag: p.tag || "",
        // Legacy records without a stock field are treated as unlimited (untracked).
        track: p.trackInventory !== false && typeof p.stock === "number",
        doc: p,
      });
    }

    // 2. Authoritative totals from current DB prices + configured rules.
    //    An unknown delivery-method id is rejected — no prices invented by the browser.
    const settings = await SiteSettings.get();
    const method = resolveShippingMethod(settings, shippingMethod || "");
    if (shippingMethod && (!method || method.id !== shippingMethod)) fail(400, "That delivery option is not available.");
    const rawSub = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0));
    const promo = await resolvePromo(coupon, rawSub);
    const totals = computeTotals(
      lines.map((l) => ({ id: l.id, name: l.name, price: l.price, mrp: l.mrp, qty: l.qty, tag: l.tag })),
      coupon || "",
      settings,
      { shippingMethodId: shippingMethod || "", promo }
    );

    // 3. Atomic stock reservation (prevents overselling; rolls back on partial failure).
    await reserveStock(lines, { by: req.user?._id });

    // 4. Create the order with an immutable snapshot. Stock is only released
    //    again when the ORDER WRITE itself fails — a failure clearing the cart
    //    or bumping a promo counter must not restock a persisted order.
    let order;
    try {
      order = await Order.create({
        orderNumber: orderNumber(),
        user: req.user._id,
        items: lines.map((l) => ({ product: l._id, productId: l.id, name: l.name, sku: l.sku, image: l.image, price: l.price, mrp: l.mrp, qty: l.qty, track: l.track })),
        totals: { ...totals, coupon: totals.coupon },
        coupon: totals.coupon,
        customer, // includes optional state + delivery notes (validated above)
        shipping: method
          ? { methodId: method.id, label: method.label, fee: totals.shipping, etaMinDays: method.etaMinDays ?? null, etaMaxDays: method.etaMaxDays ?? null }
          : undefined,
        payment: { method: payment, status: payment === "cod" ? "cod_pending" : "pending" },
        status: "placed",
        statusHistory: [{ status: "placed", at: new Date(), by: req.user._id }],
        ip: req.ip,
      });
    } catch (e) {
      // Order write failed → give the reserved stock back.
      await releaseStock(lines, { reason: "restock", by: req.user?._id, note: "order create failed" });
      throw e;
    }
    // The stored cart has been ordered — clear it server-side.
    await Cart.deleteOne({ user: req.user._id });
    if (promo) {
      // Conditional increment so concurrent checkouts can never exceed maxUses.
      const guard = promo.maxUses ? { timesUsed: { $lt: promo.maxUses } } : {};
      await PromoCode.updateOne({ code: promo.code, ...guard }, { $inc: { timesUsed: 1 } });
    }
    res.status(201).json(order.toPublic());
  })
);

// POST /api/orders/preview — server-side recalculation for checkout screens.
// Returns the authoritative totals for the CURRENT cart + delivery method
// WITHOUT creating an order (used by checkout steps 1–3 for live totals).
const previewSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(120), qty: z.number().int().min(1).max(10) })).min(1).max(30),
  coupon: z.string().max(20).optional(),
  shippingMethod: z.string().max(40).optional(),
});
router.post(
  "/preview",
  requireUser,
  validate(previewSchema),
  asyncHandler(async (req, res) => {
    const { items, coupon, shippingMethod } = req.body;
    const byKey = await findStorefrontProducts(items.map((i) => i.id));
    const lines = [];
    for (const i of items) {
      const p = byKey.get(String(i.id));
      if (!p) fail(400, `Product "${i.id}" is no longer available.`);
      const qty = Math.min(Math.max(1, i.qty), stockCap(p));
      lines.push({ id: p.id || String(p._id), name: p.name, price: p.price, mrp: p.mrp || p.price, qty, tag: p.tag || "" });
    }
    const settings = await SiteSettings.get();
    const method = resolveShippingMethod(settings, shippingMethod || "");
    if (shippingMethod && (!method || method.id !== shippingMethod)) fail(400, "That delivery option is not available.");
    const rawSub = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0));
    const promo = await resolvePromo(coupon, rawSub);
    res.json(computeTotals(lines, coupon || "", settings, { shippingMethodId: shippingMethod || "", promo }));
  })
);

// GET /api/orders — admin/staff
router.get(
  "/",
  requireRole("admin", "staff"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 100);
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    const list = await Order.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(list.map((o) => o.toAdmin()));
  })
);

// GET /api/orders/mine — the signed-in customer's OWN order history.
// Scoped strictly to req.user; customers can never see anyone else's orders.
// ?view=live → active (placed/packed/shipped); ?view=old → finished/cancelled.
const LIVE_STATUSES = ["placed", "packed", "shipped"];
router.get(
  "/mine",
  requireUser,
  asyncHandler(async (req, res) => {
    const filter = { user: req.user._id };
    if (req.query.view === "live") filter.status = { $in: LIVE_STATUSES };
    if (req.query.view === "old") filter.status = { $nin: LIVE_STATUSES };
    const list = await Order.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(list.map((o) => o.toPublic()));
  })
);

// PATCH /api/orders/:id — admin/staff status update
router.patch(
  "/:id",
  requireRole("admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!isOid(req.params.id)) fail(404, "Order not found.");
    const order = await Order.findById(req.params.id);
    if (!order) fail(404, "Order not found.");
    const to = String(req.body.status || "");
    assertTransition(order.status, to);
    // Paid online orders must be refunded before they can be cancelled —
    // otherwise stock returns to the catalogue while the money is gone.
    if (to === "cancelled" && order.payment?.status === "paid") {
      fail(400, "This order was paid online. Issue a refund before cancelling.");
    }
    order.status = to;
    if (to === "delivered" && order.payment?.method === "cod") {
      order.payment.status = "paid"; // COD collected on delivery
      order.payment.paidAt = new Date();
    }
    order.statusHistory.push({ status: to, at: new Date(), by: req.user._id, note: String(req.body.note || "").slice(0, 300) });
    await order.save();
    // Cancelling returns reserved stock to the catalogue. Only lines whose
    // inventory was actually reserved are restocked (untracked products are
    // never inflated back into existence).
    if (to === "cancelled") {
      await releaseStock(
        order.items.map((i) => ({ _id: i.product, id: i.productId, name: i.name, qty: i.qty, track: i.track !== false })),
        { reason: "cancel", orderId: order._id, by: req.user._id, note: "cancelled by admin" }
      );
    }
    res.json(order.toAdmin());
  })
);

// GET /api/orders/:id — owner (session) or guest with matching phone
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isOid(req.params.id)) fail(404, "Order not found.");
    const order = await Order.findById(req.params.id);
    if (!order) fail(404, "Order not found.");
    const isOwner = req.user && order.user && String(order.user) === String(req.user._id);
    const isStaff = req.user && ["admin", "staff"].includes(req.user.role);
    const guestPhone = String(req.query.phone || "");
    const isGuestWithPhone = !order.user && guestPhone.length === 10 && order.customer.phone === guestPhone;
    if (!isOwner && !isStaff && !isGuestWithPhone) fail(403, "Provide the phone number used at checkout to view this order.");
    res.json(order.toPublic());
  })
);

module.exports = router;
