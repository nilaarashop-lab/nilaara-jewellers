const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const env = require("../config/env");

const ROLES = ["customer", "staff", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"] },
    phone: { type: String, trim: true, match: [/^[0-9]{10}$/, "Phone must be 10 digits"] }, // normalized: 10-digit Indian mobile, no +91
    passwordHash: { type: String },
    // Signup method. Privilege (role) is separate and never derived from it.
    provider: { type: String, enum: ["password", "google", "phone", "email"], default: "password" },
    googleId: { type: String }, // Google's stable subject ("sub") — unique across accounts
    role: { type: String, enum: ROLES, default: "customer" }, // privilege changes only via script/admin API with checks
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { sparse: true, unique: true });
userSchema.index({ phone: 1 }, { sparse: true, unique: true });
// One Google identity per account — prevents duplicate customers from double-clicks
// and races, and anchors the account-linking checks.
userSchema.index({ googleId: 1 }, { sparse: true, unique: true });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, env.BCRYPT_ROUNDS);
};
userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return this.passwordHash ? bcrypt.compare(plain, this.passwordHash) : Promise.resolve(false);
};

/**
 * Public representation — never includes passwordHash, googleId or session data.
 * `provider`/`googleLinked` let the account page show which sign-in methods exist.
 */
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email || null,
    phone: this.phone || null,
    role: this.role,
    provider: this.provider,
    googleLinked: Boolean(this.googleId),
    phoneVerified: this.phoneVerified,
    emailVerified: this.emailVerified,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
