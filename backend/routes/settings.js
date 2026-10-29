/**
 * Storefront settings routes.
 *  - GET  /            public. Storefront-safe subset (announcement/marquee,
 *                      homepage hero/cards/festive image, brand block, delivery
 *                      methods, payment availability). Contains NO secrets.
 *  - GET  /admin       admin/staff — the full editable document for the admin
 *                      "Homepage" editor (image publicIds included).
 *  - PATCH /           admin/staff — update announcement (incl. marquee lines)
 *                      and homepage content (hero slides, cards, festive
 *                      banner). Images must come from the upload endpoint or
 *                      an approved host — same rule as product photos.
 */
const express = require("express");
const z = require("zod");
const env = require("../config/env");
const SiteSettings = require("../models/SiteSettings");
const { validate } = require("../middleware/validate");
const { requireRole } = require("../middleware/auth");
const { asyncHandler, fail } = require("../lib/apiError");
const { isAllowedImageUrl } = require("../lib/imageRefs");
const { audit } = require("../lib/audit");

const router = express.Router();

const imgRef = z.object({
  url: z.string().max(1000),
  publicId: z.string().max(300).optional(),
  alt: z.string().max(200).optional(),
});

const slideSchema = z.object({
  image: imgRef.optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(120).optional(),
  highlight: z.string().max(120).optional(),
  text: z.string().max(400).optional(),
  active: z.boolean().optional(),
});

const cardSchema = z.object({
  image: imgRef.optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(80).optional(),
  text: z.string().max(160).optional(),
  to: z.string().max(200).optional(),
  linkLabel: z.string().max(40).optional(),
  active: z.boolean().optional(),
});

const tileSchema = z.object({
  slug: z.string().min(1).max(60),
  image: imgRef.optional(),
});

const patchSchema = z
  .object({
    announcement: z
      .object({
        text: z.string().max(300).optional(),
        shortText: z.string().max(120).optional(),
        active: z.boolean().optional(),
        messages: z
          .array(z.object({ text: z.string().min(1).max(160), active: z.boolean().optional() }))
          .max(8)
          .optional(),
      })
      .optional(),
    home: z
      .object({
        heroSlides: z.array(slideSchema).max(4).optional(),
        cards: z.array(cardSchema).max(4).optional(),
        festive: z.object({ image: imgRef.optional(), active: z.boolean().optional() }).optional(),
        categoryTiles: z.array(tileSchema).max(12).optional(),
        collectionTiles: z.array(tileSchema).max(12).optional(),
      })
      .optional(),
    coupons: z
      .object({
        b1g1: z.object({ enabled: z.boolean().optional() }).optional(),
        flat25: z.object({ enabled: z.boolean().optional(), percent: z.number().min(1).max(90).optional(), minSubtotal: z.number().min(0).max(100000).optional() }).optional(),
      })
      .optional(),
  })
  .refine((b) => b.announcement || b.home || b.coupons, { message: "Nothing to update." });

/**
 * Validates every image URL in the patch against the approved-host rule.
 * Same guarantee as product photos: uploads (or allow-listed hosts) only —
 * an admin can never inject an arbitrary tracking URL into the storefront.
 * Local-driver uploads (`/uploads/…`, served by our own backend) are also
 * accepted so development with STORAGE_DRIVER=local works.
 */
const LOCAL_UPLOAD_RE = /^\/uploads\/[A-Za-z0-9._-]+$/;
function assertImagesAllowed(body) {
  const rejected = [];
  const check = (img) => {
    if (!img?.url) return;
    if (LOCAL_UPLOAD_RE.test(img.url)) return;
    if (!isAllowedImageUrl(img.url)) rejected.push(img.url);
  };
  (body.home?.heroSlides || []).forEach((s) => check(s.image));
  (body.home?.cards || []).forEach((c) => check(c.image));
  (body.home?.categoryTiles || []).forEach((t) => check(t.image));
  (body.home?.collectionTiles || []).forEach((t) => check(t.image));
  check(body.home?.festive?.image);
  if (rejected.length) fail(400, "One or more image URLs are not from an approved source. Please upload images first.", { rejected });
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const s = await SiteSettings.get();
    res.json({
      ...s.toPublic(),
      payments: {
        cod: true, // COD is always available unless business rules change (settings-driven later)
        razorpay: env.paymentsEnabled(),
      },
    });
  })
);

// Full document for the admin editor (session-protected).
router.get(
  "/admin",
  requireRole("admin", "staff"),
  asyncHandler(async (_req, res) => {
    const s = await SiteSettings.get();
    res.json({
      announcement: {
        text: s.announcement.text,
        shortText: s.announcement.shortText,
        active: s.announcement.active,
        messages: (s.announcement.messages || []).map((m) => ({ text: m.text, active: m.active !== false })),
      },
      home: {
        heroSlides: (s.home?.heroSlides || []).map((sl) => ({
          image: { url: sl.image?.url || "", publicId: sl.image?.publicId || "", alt: sl.image?.alt || "" },
          eyebrow: sl.eyebrow || "",
          title: sl.title || "",
          highlight: sl.highlight || "",
          text: sl.text || "",
          active: sl.active !== false,
        })),
        cards: (s.home?.cards || []).map((c) => ({
          image: { url: c.image?.url || "", publicId: c.image?.publicId || "", alt: c.image?.alt || "" },
          eyebrow: c.eyebrow || "",
          title: c.title || "",
          text: c.text || "",
          to: c.to || "/shop",
          linkLabel: c.linkLabel || "Shop now →",
          active: c.active !== false,
        })),
        festive: {
          image: {
            url: s.home?.festive?.image?.url || "",
            publicId: s.home?.festive?.image?.publicId || "",
            alt: s.home?.festive?.image?.alt || "",
          },
          active: Boolean(s.home?.festive?.active),
        },
        categoryTiles: (s.home?.categoryTiles || []).map((t) => ({
          slug: t.slug,
          image: { url: t.image?.url || "", publicId: t.image?.publicId || "", alt: t.image?.alt || "" },
        })),
        collectionTiles: (s.home?.collectionTiles || []).map((t) => ({
          slug: t.slug,
          image: { url: t.image?.url || "", publicId: t.image?.publicId || "", alt: t.image?.alt || "" },
        })),
      },
      coupons: {
        b1g1: { enabled: s.coupons?.b1g1?.enabled !== false, minItems: s.coupons?.b1g1?.minItems ?? 2 },
        flat25: {
          enabled: s.coupons?.flat25?.enabled !== false,
          percent: s.coupons?.flat25?.percent ?? 25,
          minSubtotal: s.coupons?.flat25?.minSubtotal ?? 1000,
        },
      },
    });
  })
);

router.patch(
  "/",
  requireRole("admin", "staff"),
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    assertImagesAllowed(req.body);
    const s = await SiteSettings.get();

    if (req.body.announcement) {
      const a = req.body.announcement;
      if (a.text !== undefined) s.announcement.text = a.text;
      if (a.shortText !== undefined) s.announcement.shortText = a.shortText;
      if (a.active !== undefined) s.announcement.active = a.active;
      if (a.messages !== undefined) {
        s.announcement.messages = a.messages.map((m) => ({ text: m.text, active: m.active !== false }));
      }
    }

    if (req.body.home) {
      const h = req.body.home;
      if (h.heroSlides !== undefined) {
        s.home.heroSlides = h.heroSlides.map((sl) => ({
          image: {
            url: sl.image?.url || "",
            publicId: sl.image?.publicId || "",
            alt: sl.image?.alt || "",
          },
          eyebrow: sl.eyebrow || "",
          title: sl.title || "",
          highlight: sl.highlight || "",
          text: sl.text || "",
          active: sl.active !== false,
        }));
      }
      if (h.cards !== undefined) {
        s.home.cards = h.cards.map((c) => ({
          image: {
            url: c.image?.url || "",
            publicId: c.image?.publicId || "",
            alt: c.image?.alt || "",
          },
          eyebrow: c.eyebrow || "",
          title: c.title || "",
          text: c.text || "",
          to: c.to || "/shop",
          linkLabel: c.linkLabel || "Shop now →",
          active: c.active !== false,
        }));
      }
      if (h.festive !== undefined) {
        s.home.festive = {
          image: {
            url: h.festive.image?.url || "",
            publicId: h.festive.image?.publicId || "",
            alt: h.festive.image?.alt || "",
          },
          active: Boolean(h.festive.active),
        };
      }
      if (h.categoryTiles !== undefined) {
        s.home.categoryTiles = h.categoryTiles.map((t) => ({
          slug: t.slug,
          image: { url: t.image?.url || "", publicId: t.image?.publicId || "", alt: t.image?.alt || "" },
        }));
      }
      if (h.collectionTiles !== undefined) {
        s.home.collectionTiles = h.collectionTiles.map((t) => ({
          slug: t.slug,
          image: { url: t.image?.url || "", publicId: t.image?.publicId || "", alt: t.image?.alt || "" },
        }));
      }
    }

    if (req.body.coupons) {
      const c = req.body.coupons;
      if (c.b1g1?.enabled !== undefined) s.coupons.b1g1.enabled = c.b1g1.enabled;
      if (c.flat25) {
        if (c.flat25.enabled !== undefined) s.coupons.flat25.enabled = c.flat25.enabled;
        if (c.flat25.percent !== undefined) s.coupons.flat25.percent = c.flat25.percent;
        if (c.flat25.minSubtotal !== undefined) s.coupons.flat25.minSubtotal = c.flat25.minSubtotal;
      }
    }

    s.updatedBy = req.user._id;
    await s.save();
    await audit(req, "settings.update", "settings", {
      sections: [req.body.announcement && "announcement", req.body.home && "home", req.body.coupons && "coupons"].filter(Boolean),
    });
    res.json(s.toPublic());
  })
);

module.exports = router;
