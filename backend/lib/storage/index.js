/**
 * Storage abstraction: driver selected by STORAGE_DRIVER (local | cloudinary | imagekit).
 * Only images whose CONTENT has been verified by lib/images.js reach this layer.
 * Production must use cloudinary or imagekit (validated in config/env.js).
 */
const env = require("../../config/env");
const { detectImageFormat } = require("../images");

const drivers = {
  local: () => require("./local"),
  cloudinary: () => require("./cloudinary"),
  imagekit: () => require("./imagekit"),
};

function activeDriver() {
  if (env.STORAGE_DRIVER === "cloudinary") {
    if (!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)) {
      const err = new Error("Image storage is not configured on the server. Ask the administrator to set the Cloudinary credentials.");
      err.status = 503;
      throw err;
    }
  }
  if (env.STORAGE_DRIVER === "imagekit") {
    if (!env.IMAGEKIT_PRIVATE_KEY) {
      const err = new Error("Image storage is not configured on the server. Ask the administrator to set the ImageKit private key.");
      err.status = 503;
      throw err;
    }
  }
  return drivers[env.STORAGE_DRIVER]();
}

/** Saves a raw image buffer after magic-byte content verification. Returns asset metadata. */
async function saveImageBuffer(buffer) {
  const format = detectImageFormat(buffer);
  if (!format) {
    const err = new Error("Unsupported or invalid image. Allowed: JPEG, PNG, WebP, GIF.");
    err.status = 400;
    throw err;
  }
  if (buffer.length > env.MAX_UPLOAD_MB * 1024 * 1024) {
    const err = new Error(`Image exceeds ${env.MAX_UPLOAD_MB} MB limit.`);
    err.status = 400;
    throw err;
  }
  return activeDriver().saveImage({ buffer, format });
}

/** Re-hosts an existing remote image (migration only). */
async function saveRemoteImage(remoteUrl) {
  if (!["cloudinary", "imagekit"].includes(env.STORAGE_DRIVER)) {
    const err = new Error("Remote import requires STORAGE_DRIVER=cloudinary or imagekit.");
    err.status = 503;
    throw err;
  }
  return activeDriver().saveRemote({ remoteUrl });
}

async function deleteImage(publicId, provider) {
  const driver = provider && drivers[provider] ? provider : env.STORAGE_DRIVER;
  return drivers[driver]().deleteImage(publicId);
}

module.exports = { saveImageBuffer, saveRemoteImage, deleteImage, activeDriver };
