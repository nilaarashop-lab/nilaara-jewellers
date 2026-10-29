/** Server entry point: validate configuration, connect MongoDB, listen. */
const env = require("./config/env");
const mongoose = require("mongoose");
const { createApp } = require("./app");

const configErrors = env.validateEnv();
if (configErrors.length) {
  console.error("FATAL — refusing to start with invalid configuration:");
  for (const e of configErrors) console.error("  • " + e);
  process.exit(1);
}

mongoose
  .connect(env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    createApp().listen(env.PORT, () => console.log(`Nilaara API on :${env.PORT} (storage: ${env.STORAGE_DRIVER}, payments: ${env.paymentsEnabled() ? "live" : "disabled"})`));
  })
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1); // no silent "runs without DB" mode in production
  });

process.on("unhandledRejection", (e) => {
  console.error("[fatal] unhandled rejection:", e);
});
