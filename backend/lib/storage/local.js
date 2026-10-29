/** Local-disk image storage (development / small deployments). */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const env = require("../../config/env");
const { EXT } = require("../../lib/images");

async function saveImage({ buffer, format }) {
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  const name = `nil-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${EXT[format] || ".jpg"}`;
  await fs.writeFile(path.join(env.UPLOAD_DIR, name), buffer);
  return {
    url: `${env.PUBLIC_BASE_URL || ""}/uploads/${name}`,
    publicId: name,
    bytes: buffer.length,
    format,
    provider: "local",
  };
}

async function deleteImage(publicId) {
  // Only ever remove files inside the upload directory.
  const safe = path.basename(publicId);
  await fs.unlink(path.join(env.UPLOAD_DIR, safe)).catch(() => {});
}

module.exports = { saveImage, deleteImage };
