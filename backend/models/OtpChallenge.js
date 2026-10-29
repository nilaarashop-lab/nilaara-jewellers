const mongoose = require("mongoose");

/**
 * One active login challenge per phone number OR per email address.
 * SECURITY: never stores the OTP itself — only an HMAC-SHA256 hash bound to
 * identifier + channel (see lib/otp/core.js; email uses purpose "email"), so a
 * code issued for SMS can never verify as an email code or vice versa.
 * TTL index removes expired challenges automatically.
 */
const otpChallengeSchema = new mongoose.Schema(
  {
    // Exactly one of phone/email identifies the challenge (enforced below).
    phone: { type: String, unique: true, sparse: true, match: [/^[0-9]{10}$/, "Phone must be a normalized 10-digit mobile"] },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"] },
    channel: { type: String, enum: ["sms", "email"], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, // wrong verify attempts so far
    sentAt: { type: Date, required: true }, // drives the resend cooldown
    provider: { type: String }, // which provider delivered it (twofactor / msg91 / twilio / resend / mock)
    ip: { type: String }, // requester IP for audit
  },
  { timestamps: true }
);

otpChallengeSchema.pre("validate", function validateIdentifier(next) {
  if ((this.phone ? 1 : 0) + (this.email ? 1 : 0) !== 1) {
    next(new Error("OtpChallenge requires exactly one of phone or email"));
  } else {
    next();
  }
});

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 }); // sweep shortly after expiry

module.exports = mongoose.model("OtpChallenge", otpChallengeSchema);
