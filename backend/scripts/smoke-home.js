/**
 * Dev smoke launcher: in-memory MongoDB + real Express app on an ephemeral
 * port, with one admin account created the sanctioned way. Prints the base
 * URL and admin credentials. TEMPORARY — delete after the smoke test.
 */
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:5099";
process.env.FRONTEND_URL = "http://localhost:5299"; // CORS for the smoke Vite dev server
process.env.ALLOWED_IMAGE_HOSTS = "images.unsplash.com";
process.env.OTP_PROVIDER = "";
process.env.BCRYPT_ROUNDS = "6";

const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = require("../app");
  const app = createApp();
  const server = app.listen(5099, async () => {
    const bcrypt = require("bcryptjs");
    const admin = await mongoose.model("User").create({
      name: "Smoke Admin", email: "admin@smoke.test", provider: "password", role: "admin",
    });
    admin.passwordHash = await bcrypt.hash("Smoke@12345", 6);
    await admin.save();
    console.log(`SMOKE_BACKEND=http://127.0.0.1:5099 admin=admin@smoke.test pass=Smoke@12345`);
  });
  process.on("SIGTERM", async () => { server.close(); await mongoose.disconnect(); await mongod.stop(); process.exit(0); });
})();
