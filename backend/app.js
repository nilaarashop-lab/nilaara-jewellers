/**
 * Express application factory (separated from server.js so tests can boot the
 * app without opening a port or connecting to MongoDB).
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const mongoose = require("mongoose");

const env = require("./config/env");
const { attachUser } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/error");
const { csrfGuard } = require("./lib/csrf");

const authRoute = require("./routes/auth");
const productsRoute = require("./routes/products");
const ordersRoute = require("./routes/orders");
const cartRoute = require("./routes/cart");
const uploadRoute = require("./routes/upload");
const paymentsRoute = require("./routes/payments");
const statsRoute = require("./routes/stats");
const settingsRoute = require("./routes/settings");
const promosRoute = require("./routes/promos");

function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);

  // Security headers. CORP is relaxed to "cross-origin" so the separately-hosted
  // React app can load legacy /uploads images in development.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // Explicit CORS: only the configured frontend origin(s), with credentials
  // (cookie-based admin sessions). Never "*" — that cannot send credentials.
  app.use(cors({ origin: env.FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean), credentials: true }));

  app.use(cookieParser());

  // CSRF: state-changing requests must come from our frontend origin (in
  // addition to SameSite=Lax cookies). See lib/csrf.js.
  app.use("/api", csrfGuard);

  // Webhook signature verification needs the RAW body — mount before express.json.
  app.use("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));

  // Resolves req.user from the session cookie when present (never rejects).
  app.use(attachUser);

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, db: mongoose.connection.readyState, storage: env.STORAGE_DRIVER, payments: env.paymentsEnabled() })
  );

  app.use("/api/auth", authRoute);
  app.use("/api/products", productsRoute);
  app.use("/api/orders", ordersRoute);
  app.use("/api/cart", cartRoute);
  app.use("/api/upload", uploadRoute);
  app.use("/api/payments", paymentsRoute);
  app.use("/api/stats", statsRoute);
  app.use("/api/settings", settingsRoute);
  app.use("/api/promos", promosRoute);

  // Legacy local uploads stay served so previously saved images keep working.
  // New uploads go to Cloudinary; nothing new is written to this folder in production.
  app.use(
    "/uploads",
    express.static(path.resolve(env.UPLOAD_DIR), { dotfiles: "deny", index: false, maxAge: env.isProd ? "7d" : 0 })
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
