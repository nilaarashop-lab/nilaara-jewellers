/**
 * Image-reference safety helpers.
 *
 * Rules enforced here:
 *  - New/edited product image URLs must be HTTPS and hosted on an allow-listed
 *    domain (Cloudinary by default) — admins cannot paste arbitrary URLs to
 *    bypass the upload endpoint in production.
 *  - Cloudinary assets are only ever deleted when the publicId lives inside our
 *    own folder ("nilaara/…") AND no product or order still references the URL.
 */
const env = require("../config/env");

const FOLDER_PREFIX = "nilaara/";

function hostAllowed(hostname, allowlist) {
  return allowlist.some((h) => hostname === h || hostname.endsWith("." + h));
}

/** Validates a pasted/legacy image URL. Returns normalized URL or null. */
function isAllowedImageUrl(url) {
  if (typeof url !== "string" || !url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!hostAllowed(u.host, env.imageHostAllowlist())) return null;
  return u.toString();
}

/** publicId must belong to our Cloudinary folder before any destructive op. */
function ownsCloudinaryFolder(publicId) {
  return typeof publicId === "string" && publicId.startsWith(FOLDER_PREFIX) && !publicId.includes("..");
}

/** ImageKit fileIds are MongoDB-ObjectId-style hex strings returned by the upload API. */
const IMAGEKIT_FILE_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * True when a publicId belongs to the Nilaara asset library in ANY provider —
 * a Cloudinary publicId inside the "nilaara/" folder, or an ImageKit fileId.
 * (Faker ids still end in a 404: the real asset must exist in the database.)
 */
function ownsLibraryAsset(publicId) {
  return ownsCloudinaryFolder(publicId) || IMAGEKIT_FILE_ID_RE.test(String(publicId || "").trim());
}

/**
 * Normalizes admin-supplied image input (strings or {url,publicId,alt} objects).
 * Returns { images, rejected } — rejected entries are reported, never silently saved.
 */
function normalizeImages(input) {
  const images = [];
  const rejected = [];
  for (const raw of Array.isArray(input) ? input.slice(0, 12) : []) {
    if (raw && typeof raw === "object" && raw.url) {
      const url = isAllowedImageUrl(raw.url);
      if (!url) {
        rejected.push(String(raw.url));
        continue;
      }
      images.push({ url, publicId: typeof raw.publicId === "string" ? raw.publicId : "", alt: String(raw.alt || "").slice(0, 200) });
    } else if (typeof raw === "string") {
      const url = isAllowedImageUrl(raw);
      if (!url) {
        rejected.push(raw);
        continue;
      }
      images.push({ url, publicId: "", alt: "" });
    } else {
      rejected.push(String(raw));
    }
  }
  return { images, rejected };
}

/**
 * True when the URL/publicId is still used by another product or by any order
 * snapshot (orders must keep their historical appearance).
 */
async function isAssetReferenced({ url, publicId, excludeProductId }) {
  const Product = require("../models/Product");
  const Order = require("../models/Order");
  const productQuery = { $or: [{ "images.url": url }] };
  if (publicId) productQuery.$or.push({ "images.publicId": publicId });
  if (excludeProductId) productQuery._id = { $ne: excludeProductId };
  const [products, orders] = await Promise.all([Product.countDocuments(productQuery), Order.countDocuments({ "items.image": url })]);
  return products + orders > 0;
}

module.exports = { FOLDER_PREFIX, isAllowedImageUrl, ownsCloudinaryFolder, ownsLibraryAsset, normalizeImages, isAssetReferenced };
