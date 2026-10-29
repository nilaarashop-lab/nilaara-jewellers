/**
 * Image upload routes — files stream through the backend to the configured
 * image provider (ImageKit, Cloudinary or local disk, per STORAGE_DRIVER).
 *
 * Guarantees:
 *  - Admin/staff session required (cookie auth + role check).
 *  - Multer uses MEMORY storage: nothing is ever written to the app server.
 *  - Content verification via magic bytes (a .exe renamed to .jpg is rejected).
 *  - 5 MB per file, max 6 files per request.
 *  - Unique public IDs inside the "nilaara/products" folder (Cloudinary) or
 *    ImageKit fileIds — every driver stores an admin-resolvable publicId.
 *  - Every upload is recorded as an Asset document (URL + metadata, no binaries).
 */
const express = require("express");
const multer = require("multer");
const env = require("../config/env");
const Asset = require("../models/Asset");
const { requireRole } = require("../middleware/auth");
const { HttpError, asyncHandler, fail } = require("../lib/apiError");
const { saveImageBuffer, deleteImage } = require("../lib/storage");
const { ownsLibraryAsset, isAssetReferenced } = require("../lib/imageRefs");
const { audit } = require("../lib/audit");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(), // buffer only — no disk writes on the server
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: env.MAX_UPLOAD_FILES },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, "Only JPEG, PNG, WebP or GIF images are allowed."));
  },
});

const runUpload = (req, res, next) =>
  upload.array("photos", env.MAX_UPLOAD_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof HttpError) return next(err);
    if (err.code === "LIMIT_FILE_SIZE") return next(new HttpError(400, `Each image must be ${env.MAX_UPLOAD_MB} MB or smaller.`));
    if (err.code === "LIMIT_FILE_COUNT") return next(new HttpError(400, `Maximum ${env.MAX_UPLOAD_FILES} images per upload.`));
    next(new HttpError(400, "Upload failed — please try again."));
  });

// POST /api/upload — form-data: photos[] (≤6) → { images:[{url,publicId,alt}], urls, assetIds }
router.post(
  "/",
  requireRole("admin", "staff"),
  runUpload,
  asyncHandler(async (req, res) => {
    if (!req.files?.length) fail(400, "No images received.");
    const images = [];
    const assetIds = [];
    const saved = [];
    try {
      for (const f of req.files) {
        const meta = await saveImageBuffer(f.buffer); // magic-byte verified, driver upload
        const asset = await Asset.create({ ...meta, kind: "product", uploadedBy: req.user._id });
        saved.push(meta);
        assetIds.push(asset._id);
        images.push({ url: meta.url, publicId: meta.publicId, alt: "" });
      }
    } catch (e) {
      // Best-effort cleanup of anything already uploaded for this request.
      for (const s of saved) await deleteImage(s.publicId, s.provider).catch(() => {});
      if (e.expose) throw new HttpError(502, e.message); // driver-safe detail (e.g. "ImageKit upload failed: 403 …")
      if (e.status && e.status < 500) throw e;
      throw new HttpError(502, "Image upload failed — please try again.");
    }
    await audit(req, "asset.upload", { type: "asset", id: String(assetIds[0]) }, { count: images.length, provider: env.STORAGE_DRIVER });
    res.status(201).json({ images, urls: images.map((i) => i.url), assetIds });
  })
);

// DELETE /api/upload/assets/:publicId — removes an UNREFERENCED asset from storage.
// Never touches anything outside our own "nilaara/" folder.
router.delete(
  "/assets/:publicId",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const publicId = decodeURIComponent(req.params.publicId);
    if (!ownsLibraryAsset(publicId)) fail(400, "This asset does not belong to the Nilaara library.");
    const asset = await Asset.findOne({ publicId });
    const url = asset?.url;
    if (!asset) fail(404, "Asset not found.");
    if (url && (await isAssetReferenced({ url, publicId, excludeProductId: null }))) {
      fail(409, "This image is still used by a product or order and cannot be deleted.");
    }
    await deleteImage(publicId, asset.provider);
    await asset.deleteOne();
    await audit(req, "asset.delete", { type: "asset", id: String(asset._id) }, { publicId });
    res.json({ ok: true });
  })
);

module.exports = router;
