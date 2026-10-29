/**
 * Product routes.
 *  - Public: read PUBLISHED products only (legacy records without a status count as published).
 *  - Admin/staff: full CRUD. Mutations are session-protected, Zod-validated and
 *    field-whitelisted. Image entries must come from the upload endpoint or an
 *    allow-listed host — arbitrary URLs cannot bypass upload authorization.
 */
const express = require("express");
const z = require("zod");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { validate } = require("../middleware/validate");
const { requireRole } = require("../middleware/auth");
const { asyncHandler, fail } = require("../lib/apiError");
const { normalizeImages, isAssetReferenced } = require("../lib/imageRefs");
const { deleteImage } = require("../lib/storage");
const { audit } = require("../lib/audit");

const router = express.Router();

const isOid = (s) => mongoose.Types.ObjectId.isValid(s);
const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

/** Legacy products (created before statuses existed) remain visible. */
const PUBLISHED = { $or: [{ status: "published" }, { status: { $exists: false } }] };

const imageField = z
  .array(z.union([z.string().max(1000), z.object({ url: z.string().max(1000), publicId: z.string().max(300).optional(), alt: z.string().max(200).optional() })]))
  .max(12)
  .optional();

const productSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(200).optional(),
  sku: z.string().max(80).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
  collection: z.string().max(80).optional(),
  metal: z.string().max(80).optional(),
  purity: z.string().max(80).optional(),
  plating: z.string().max(80).optional(),
  stones: z.string().max(120).optional(),
  grossWeightG: z.number().min(0).max(100000).optional(),
  netWeightG: z.number().min(0).max(100000).optional(),
  size: z.string().max(60).optional(),
  price: z.number().min(0).max(10_000_000),
  mrp: z.number().min(0).max(10_000_000).optional(),
  makingCharges: z.number().min(0).max(1_000_000).optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  trackInventory: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).max(10000).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  featured: z.boolean().optional(),
  bestseller: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  badge: z.string().max(40).optional(),
  tag: z.string().max(60).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().min(0).max(10_000_000).optional(),
  images: imageField,
});
const productPatchSchema = productSchema.partial();

/** Removes storage assets (Cloudinary/ImageKit/local) that this product no longer uses and nothing else references. */
async function cleanupRemovedImages(oldDoc, newImages, productId) {
  const keepUrls = new Set(newImages.map((i) => i.url));
  for (const img of oldDoc.images || []) {
    if (keepUrls.has(img.url) || !img.publicId) continue;
    // Safety: only delete assets inside our own folder, and only when unreferenced.
    if (!(await isAssetReferenced({ url: img.url, publicId: img.publicId, excludeProductId: productId }))) {
      await deleteImage(img.publicId, img.provider).catch((e) => console.error("[cleanup]", e.message));
    }
  }
}

// ── Public ──

// GET /api/products?cat=&col=&q=&page=&limit=  → array (legacy-compatible shape)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { cat, col, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    // Admin listing (?admin=1) shows every status so drafts are never "lost".
    const adminAll = req.query.admin === "1" && req.user && ["admin", "staff"].includes(req.user.role);
    const filter = adminAll ? {} : { ...PUBLISHED };
    if (cat) filter.category = String(cat);
    if (col) filter.collection = String(col);
    if (q) {
      // Safe literal search (escaped) — no regex injection.
      const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(escaped, "i");
    }
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.set("X-Total-Count", String(total));
    res.json(items.map((p) => p.toPublic()));
  })
);

// GET /api/products/:id — legacy id, slug or Mongo _id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const or = [{ id }, { slug: String(id).toLowerCase() }];
    if (isOid(id)) or.push({ _id: id });
    const p = await Product.findOne({ $or: or });
    if (!p) fail(404, "Product not found.");
    const published = p.status === "published" || p.status === undefined;
    if (!published && !(req.user && ["admin", "staff"].includes(req.user.role))) fail(404, "Product not found.");
    res.json(p.toPublic());
  })
);

// ── Admin / staff ──

router.post(
  "/",
  requireRole("admin", "staff"),
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const { images, rejected } = normalizeImages(body.images || []);
    if (rejected.length) fail(400, "One or more image URLs are not from an approved source. Please upload images first.", { rejected });
    const id = `nilaara-${Date.now().toString(36)}`;
    const doc = await Product.create({
      id,
      slug: body.slug ? slugify(body.slug) : slugify(body.name) + "-" + Date.now().toString(36),
      name: body.name,
      sku: body.sku,
      description: body.description || "",
      category: body.category,
      collection: body.collection,
      metal: body.metal,
      purity: body.purity,
      plating: body.plating,
      stones: body.stones,
      grossWeightG: body.grossWeightG,
      netWeightG: body.netWeightG,
      size: body.size,
      price: body.price,
      mrp: body.mrp ?? body.price,
      makingCharges: body.makingCharges || 0,
      stock: body.stock ?? 0,
      trackInventory: body.trackInventory ?? true,
      lowStockThreshold: body.lowStockThreshold,
      status: body.status || "draft",
      featured: body.featured || false,
      bestseller: body.bestseller || false,
      newArrival: body.newArrival || false,
      badge: body.badge,
      tag: body.tag,
      rating: body.rating ?? 0,
      reviews: body.reviews ?? 0,
      images,
      publishedAt: (body.status || "draft") === "published" ? new Date() : undefined,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    await audit(req, "product.create", { type: "product", id: String(doc._id) }, { name: doc.name, status: doc.status });
    res.status(201).json(doc.toAdmin());
  })
);

router.put(
  "/:id",
  requireRole("admin", "staff"),
  validate(productPatchSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const or = [{ id }, { slug: String(id).toLowerCase() }];
    if (isOid(id)) or.push({ _id: id });
    const doc = await Product.findOne({ $or: or });
    if (!doc) fail(404, "Product not found.");

    const patch = { ...req.body };
    if (patch.name && !patch.slug) delete patch.slug; // never silently rename slugs on edit
    if (patch.slug) patch.slug = slugify(patch.slug);
    if (patch.images) {
      const { images, rejected } = normalizeImages(patch.images);
      if (rejected.length) fail(400, "One or more image URLs are not from an approved source.", { rejected });
      patch.images = images;
    }
    // Snapshot the previous images BEFORE applying the patch, so replaced ones can be cleaned up.
    const oldImages = (doc.images || []).map((i) => ({ url: i.url, publicId: i.publicId }));

    // Only save AFTER the new images are confirmed — then clean up what was replaced.
    Object.assign(doc, patch);
    doc.updatedBy = req.user._id;
    await doc.save();
    if (patch.images) await cleanupRemovedImages({ images: oldImages }, doc.images, doc._id).catch((e) => console.error("[cleanup]", e.message));
    await audit(req, "product.update", { type: "product", id: String(doc._id) }, { fields: Object.keys(patch) });
    res.json(doc.toAdmin());
  })
);

router.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const or = [{ id }, { slug: String(id).toLowerCase() }];
    if (isOid(id)) or.push({ _id: id });
    const doc = await Product.findOne({ $or: or });
    if (!doc) fail(404, "Product not found.");

    // Images referenced by historical orders must survive the product.
    for (const img of doc.images || []) {
      if (!img.publicId) continue;
      const usedByOrder = await Order.countDocuments({ "items.image": img.url });
      if (usedByOrder === 0 && (await isAssetReferenced({ url: img.url, publicId: img.publicId, excludeProductId: doc._id }))) continue;
      if (usedByOrder === 0) await deleteImage(img.publicId, img.provider).catch((e) => console.error("[cleanup]", e.message));
    }
    await doc.deleteOne();
    await audit(req, "product.delete", { type: "product", id }, { name: doc.name });
    res.json({ ok: true });
  })
);

module.exports = router;
