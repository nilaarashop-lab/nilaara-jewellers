/**
 * ImageKit image storage driver (ImageKit.io REST API — no SDK needed).
 * - Files stream through the backend and land as ImageKit assets — never on the
 *   app server, never in Mongo.
 * - Auth is HTTP Basic with the PRIVATE key (username = private key, empty password).
 * - Upload:    POST https://upload.imagekit.io/api/v1/files/upload  (multipart)
 * - Delete:    DELETE https://api.imagekit.io/v1/files/{fileId}
 * - `publicId` stores the ImageKit fileId so product cleanup can delete later.
 * Content verified by lib/images.js (magic bytes) before reaching this layer.
 */
const env = require("../../config/env");
const crypto = require("crypto");
const { EXT } = require("../../lib/images");

const FOLDER = "nilaara/products";
const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const fileUrl = (fileId) => `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`;

/** Basic header: username = private key, password = "" (per ImageKit docs). */
function authHeaders() {
  const token = Buffer.from(`${env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function verify(res, context) {
  if (res.ok) return res.json();
  let message = "";
  try {
    const body = await res.json();
    message = body.message || body.detail || "";
  } catch {
    message = await res.text().catch(() => "");
  }
  const err = new Error(`ImageKit ${context} failed: ${message || res.status}. Check the IMAGEKIT_PRIVATE_KEY on the server.`);
  err.status = res.status;
  err.expose = true;
  throw err;
}

/** Uploads a binary buffer; returns {url, publicId, bytes, format, width, height, provider}. */
async function saveImage({ buffer, format }) {
  const fileName = `nil-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${EXT[format] || ".jpg"}`;
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: `image/${format === "jpg" ? "jpeg" : format}` }), fileName);
  fd.append("fileName", fileName);
  fd.append("folder", FOLDER);
  fd.append("useUniqueFileName", "false"); // our name is already unique
  fd.append("overwriteFile", "false");

  const res = await fetch(UPLOAD_URL, { method: "POST", headers: authHeaders(), body: fd });
  const data = await verify(res, "upload");
  return {
    url: data.url, // default CDN URL, e.g. https://ik.imagekit.io/<workspace>/nilaara/products/<file>
    publicId: data.fileId, // ImageKit fileId — required for deletes
    bytes: data.size ?? buffer.length,
    format,
    width: data.width,
    height: data.height,
    provider: "imagekit",
  };
}

/** Re-hosts an existing remote image (migration only) — ImageKit fetches the URL itself. */
async function saveRemote({ remoteUrl, format }) {
  const fileName = `nil-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${EXT[format] || ".jpg"}`;
  const fd = new FormData();
  fd.append("file", remoteUrl); // a URL string asks ImageKit to fetch & re-host it
  fd.append("fileName", fileName);
  fd.append("folder", FOLDER);
  const res = await fetch(UPLOAD_URL, { method: "POST", headers: authHeaders(), body: fd });
  const data = await verify(res, "remote import");
  return { ...data, provider: "imagekit", publicId: data.fileId, bytes: data.size ?? 0 };
}

async function deleteImage(publicId) {
  if (!publicId) return false;
  try {
    const res = await fetch(fileUrl(publicId), { method: "DELETE", headers: authHeaders() });
    if (res.ok) return true;
    console.error("[storage] imagekit delete failed:", res.status);
    return false;
  } catch (e) {
    console.error("[storage] imagekit delete failed:", e.message);
    return false;
  }
}

module.exports = { saveImage, saveRemote, deleteImage, FOLDER };
