/**
 * Promo-code routes.
 *  - GET  /active         public — the codes currently shown on the storefront
 *                         (checkout/bag promo chips). No usage counters leak.
 *  - GET  /               admin/staff — full list incl. timesUsed.
 *  - POST /               admin/staff — create (codes are unique, uppercase).
 *  - PATCH /:code         admin/staff — edit percent/minimum/active/maxUses.
 *  - DELETE /:code        admin/staff — remove.
 * Validation of a code against an order happens in the order routes — the
 * checkout is the only place a discount may be applied.
 */
const express = require("express");
const z = require("zod");
const PromoCode = require("../models/PromoCode");
const { validate } = require("../middleware/validate");
const { requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../lib/apiError");
const { createLimiter } = require("../lib/rateLimit");

const router = express.Router();

const promoLimiter = createLimiter({ windowMs: 60 * 1000, max: 60, message: "Too many promo updates. Please slow down." });

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;

const promoSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(CODE_RE, "Use letters, numbers, - or _ (e.g. FLAT25)."),
  percent: z.number().min(1).max(90),
  minSubtotal: z.number().min(0).max(100000).optional(),
  active: z.boolean().optional(),
  maxUses: z.number().int().min(1).max(1000000).nullable().optional(),
  description: z.string().max(120).optional(),
});

// Public: active codes shown on the storefront.
router.get(
  "/active",
  asyncHandler(async (_req, res) => {
    const list = await PromoCode.find({ active: true }).sort({ code: 1 }).lean();
    res.json(
      list.map((p) => ({
        code: p.code,
        percent: p.percent,
        minSubtotal: p.minSubtotal || 0,
        description: p.description || "",
      }))
    );
  })
);

// Admin: full list.
router.get(
  "/",
  requireRole("admin", "staff"),
  asyncHandler(async (_req, res) => {
    const list = await PromoCode.find().sort({ createdAt: -1 }).lean();
    res.json(
      list.map((p) => ({
        code: p.code,
        percent: p.percent,
        minSubtotal: p.minSubtotal || 0,
        active: p.active,
        maxUses: p.maxUses,
        timesUsed: p.timesUsed,
        description: p.description || "",
        createdAt: p.createdAt,
      }))
    );
  })
);

// Admin: create.
router.post(
  "/",
  requireRole("admin", "staff"),
  promoLimiter,
  validate(promoSchema),
  asyncHandler(async (req, res) => {
    const code = req.body.code.trim().toUpperCase();
    const exists = await PromoCode.findOne({ code });
    if (exists) fail(409, `Promo code "${code}" already exists.`);
    const p = await PromoCode.create({
      code,
      percent: req.body.percent,
      minSubtotal: req.body.minSubtotal ?? 0,
      active: req.body.active ?? true,
      maxUses: req.body.maxUses ?? null,
      description: req.body.description || "",
    });
    res.status(201).json(p.toPublic());
  })
);

// Admin: update (code itself is immutable — create/delete instead).
router.patch(
  "/:code",
  requireRole("admin", "staff"),
  promoLimiter,
  validate(promoSchema.partial()),
  asyncHandler(async (req, res) => {
    const p = await PromoCode.findOne({ code: String(req.params.code).toUpperCase() });
    if (!p) fail(404, "Promo code not found.");
    if (req.body.percent !== undefined) p.percent = req.body.percent;
    if (req.body.minSubtotal !== undefined) p.minSubtotal = req.body.minSubtotal;
    if (req.body.active !== undefined) p.active = req.body.active;
    if (req.body.maxUses !== undefined) p.maxUses = req.body.maxUses;
    if (req.body.description !== undefined) p.description = req.body.description;
    await p.save();
    res.json({
      code: p.code,
      percent: p.percent,
      minSubtotal: p.minSubtotal || 0,
      active: p.active,
      maxUses: p.maxUses,
      timesUsed: p.timesUsed,
      description: p.description || "",
    });
  })
);

// Admin: delete.
router.delete(
  "/:code",
  requireRole("admin", "staff"),
  asyncHandler(async (req, res) => {
    const p = await PromoCode.findOneAndDelete({ code: String(req.params.code).toUpperCase() });
    if (!p) fail(404, "Promo code not found.");
    res.json({ ok: true });
  })
);

module.exports = router;
