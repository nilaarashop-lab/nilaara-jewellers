/**
 * Server-side cart routes — the cart lives in MongoDB, attached to the user
 * account, and survives login, device changes and refreshes.
 *
 * Security invariants:
 *  - Every route requires a session (guests are sent to /login by the frontend).
 *  - The client only ever submits product IDENTIFIERS and quantities. Names,
 *    prices, images and stock limits always come from current Product records —
 *    a tampered cart payload can never change what is charged.
 *  - Unavailable / unpublished / out-of-stock products cannot be added; stock
 *    is clamped on read if it shrinks after an item was added.
 */
const express = require("express");
const z = require("zod");
const Cart = require("../models/Cart");
const { validate } = require("../middleware/validate");
const { requireUser } = require("../middleware/auth");
const { asyncHandler, fail } = require("../lib/apiError");
const { findStorefrontProducts, overStock, stockCap } = require("../services/catalog");
const { createLimiter } = require("../lib/rateLimit");

const router = express.Router();
const cartLimiter = createLimiter({ windowMs: 60 * 1000, max: 60, message: "Too many cart updates. Please slow down." });

/** Resolves a stored/introduced cart into the API shape (current DB data). */
async function viewCart(cart) {
  const stored = (cart?.items || []).map((i) => ({ id: i.productId, qty: i.qty }));
  const byKey = await findStorefrontProducts(stored.map((i) => i.id));
  const items = [];
  const removed = [];
  let sub = 0;
  let count = 0;
  for (const i of stored) {
    const p = byKey.get(String(i.id));
    if (!p) {
      removed.push(i.id); // product deleted or unpublished — drop it from the cart
      continue;
    }
    const qty = Math.min(Math.max(1, i.qty), stockCap(p));
    items.push({
      id: p.id || String(p._id),
      name: p.name,
      price: p.price,
      mrp: p.mrp || p.price,
      image: p.images?.[0]?.url || "",
      plating: p.plating || "",
      qty,
      stock: stockCap(p),
      tag: p.tag || "",
    });
    sub += p.price * qty;
    count += qty;
  }
  if (removed.length && cart) {
    cart.items = cart.items.filter((i) => !removed.includes(i.productId));
    await cart.save();
  }
  return { items, totals: { sub, count }, removed };
}

// GET /api/cart — the signed-in customer's cart with live product data
router.get(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    res.json(await viewCart(cart));
  })
);

// POST /api/cart/items { id, qty } — add (or increase) an item
router.post(
  "/items",
  requireUser,
  cartLimiter,
  validate(z.object({ id: z.string().min(1).max(120), qty: z.number().int().min(1).max(10).default(1) })),
  asyncHandler(async (req, res) => {
    const { id, qty } = req.body;
    const byKey = await findStorefrontProducts([id]);
    const p = byKey.get(String(id));
    if (!p) fail(400, "This product is no longer available.");
    if (stockCap(p) === 0) fail(400, "This product is out of stock.");

    const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
    const existing = cart.items.find((i) => i.productId === String(p.id || id));
    const nextQty = Math.min((existing?.qty || 0) + qty, 10, stockCap(p));
    if (existing) existing.qty = nextQty;
    else cart.items.push({ productId: String(p.id || id), qty: nextQty });
    await cart.save();
    res.status(201).json(await viewCart(cart));
  })
);

// POST /api/cart/merge { items } — merge a guest cart after login (capped, no price trust)
router.post(
  "/merge",
  requireUser,
  cartLimiter,
  validate(z.object({ items: z.array(z.object({ id: z.string().min(1).max(120), qty: z.number().int().min(1).max(50) })).max(50) })),
  asyncHandler(async (req, res) => {
    const byKey = await findStorefrontProducts(req.body.items.map((i) => i.id));
    const cart = (await Cart.findOne({ user: req.user._id })) || new Cart({ user: req.user._id, items: [] });
    for (const i of req.body.items) {
      const p = byKey.get(String(i.id));
      if (!p) continue; // silently skip items that are no longer sellable
      const key = String(p.id || i.id);
      const existing = cart.items.find((x) => x.productId === key);
      const nextQty = Math.min((existing?.qty || 0) + i.qty, 10, stockCap(p));
      if (existing) existing.qty = nextQty;
      else if (nextQty > 0) cart.items.push({ productId: key, qty: nextQty });
    }
    await cart.save();
    res.json(await viewCart(cart));
  })
);

// PATCH /api/cart/items/:id { qty } — set quantity (0 removes)
router.patch(
  "/items/:id",
  requireUser,
  cartLimiter,
  validate(z.object({ qty: z.number().int().min(0).max(10) })),
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) fail(404, "Your bag is empty.");
    const key = String(req.params.id);
    const existing = cart.items.find((i) => i.productId === key);
    if (!existing) fail(404, "That item is not in your bag.");
    if (req.body.qty === 0) {
      cart.items = cart.items.filter((i) => i.productId !== key);
    } else {
      const byKey = await findStorefrontProducts([key]);
      const p = byKey.get(key);
      if (!p) fail(400, "This product is no longer available.");
      if (overStock(p, req.body.qty)) fail(400, `Only ${stockCap(p)} left in stock.`);
      existing.qty = req.body.qty;
    }
    await cart.save();
    res.json(await viewCart(cart));
  })
);

// DELETE /api/cart/items/:id — remove one item
router.delete(
  "/items/:id",
  requireUser,
  cartLimiter,
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = cart.items.filter((i) => i.productId !== String(req.params.id));
      await cart.save();
    }
    res.json(cart ? await viewCart(cart) : { items: [], totals: { sub: 0, count: 0 }, removed: [] });
  })
);

// DELETE /api/cart — clear the bag (also used after a successful order)
router.delete(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    await Cart.deleteOne({ user: req.user._id });
    res.json({ items: [], totals: { sub: 0, count: 0 } });
  })
);

module.exports = router;
