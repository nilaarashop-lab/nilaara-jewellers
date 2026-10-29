const mongoose = require("mongoose");

/** Uploaded media asset metadata (binaries live in Cloudinary/local disk, never in Mongo documents). */
const assetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true, index: true },
    provider: { type: String, enum: ["local", "cloudinary", "imagekit"], required: true },
    format: { type: String, enum: ["jpg", "png", "webp", "gif"] },
    bytes: Number,
    width: Number,
    height: Number,
    kind: { type: String, enum: ["product", "homepage", "general"], default: "general" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Asset", assetSchema);
