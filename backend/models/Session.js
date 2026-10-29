const mongoose = require("mongoose");

/** Server-side session record; only the SHA-256 hash of the cookie token is stored. */
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // automatic cleanup

module.exports = mongoose.model("Session", sessionSchema);
