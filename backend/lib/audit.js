/** Audit-log writer for sensitive administrative actions. Failures never break requests. */
const AuditLog = require("../models/AuditLog");

async function audit(req, action, target, meta = {}) {
  try {
    await AuditLog.create({
      actor: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role } : null,
      action,
      target,
      meta,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
    });
  } catch (e) {
    console.error("[audit] failed:", e.message);
  }
}

module.exports = { audit };
