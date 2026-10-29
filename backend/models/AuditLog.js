const mongoose = require("mongoose");

/** Administrative audit trail (login, product/content/order/settings changes). */
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
      email: String,
      role: String,
    },
    action: { type: String, required: true, index: true }, // e.g. product.update, order.status, settings.update, auth.login
    target: {
      type: { type: String }, // product | order | settings | homepage | user | asset
      id: String,
    },
    meta: { type: Object, default: {} },
    ip: String,
    userAgent: String,
    expiresAt: { type: Date }, // optional retention limit
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
