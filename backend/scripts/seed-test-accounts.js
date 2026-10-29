/**
 * Development-only seed: creates ONE test customer and ONE test administrator.
 *
 * Safety rules (enforced in code, not by convention):
 *  - Refuses to run when NODE_ENV=production.
 *  - Credentials come from SEED_* environment variables — nothing hardcoded.
 *    (Local fallbacks below are clearly-marked dev-only values for convenience.)
 *  - NEVER overwrites an existing user: if the email already exists the account
 *    is left completely untouched — its password and role are NOT changed.
 *  - The admin role is assigned here, on the server, never from a client field.
 *
 * Usage:
 *   npm run seed:accounts
 *   # or with explicit credentials:
 *   SEED_CUSTOMER_EMAIL=me@example.com SEED_CUSTOMER_PASSWORD=... \
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=... npm run seed:accounts
 *
 * To change a seeded account's password afterwards, edit it in MongoDB or use
 * `npm run create-admin -- --email=... --reset-password` for the admin.
 */
const env = require("../config/env");
const mongoose = require("mongoose");
const User = require("../models/User");

// Local-dev fallbacks — used ONLY outside production, and only when the
// SEED_* variables are unset. Never use these anywhere real.
const DEV_CUSTOMER = { email: "customer@nilaara.test", password: "Customer@12345", name: "Test Customer" };
const DEV_ADMIN = { email: "admin@nilaara.test", password: "Admin@123456", name: "Test Admin" };

async function seedTestAccounts({ isProd = env.isProd } = {}) {
  if (isProd) {
    return { ok: false, error: "Refusing to seed test accounts in production." };
  }
  const specs = [
    {
      role: "customer",
      email: (env.SEED_CUSTOMER_EMAIL || DEV_CUSTOMER.email).toLowerCase(),
      password: env.SEED_CUSTOMER_PASSWORD || DEV_CUSTOMER.password,
      name: env.SEED_CUSTOMER_EMAIL ? "Test Customer" : DEV_CUSTOMER.name,
    },
    {
      role: "admin",
      email: (env.SEED_ADMIN_EMAIL || DEV_ADMIN.email).toLowerCase(),
      password: env.SEED_ADMIN_PASSWORD || DEV_ADMIN.password,
      name: env.SEED_ADMIN_EMAIL ? "Test Admin" : DEV_ADMIN.name,
    },
  ];

  const created = [];
  const skipped = [];
  for (const spec of specs) {
    if (!spec.password || spec.password.length < 8) {
      return { ok: false, error: `Seed password for ${spec.email} must be at least 8 characters.` };
    }
    const existing = await User.findOne({ email: spec.email });
    if (existing) {
      // Never modify an existing account (password, role or status stay as-is).
      skipped.push({ email: spec.email, role: existing.role, note: "already exists — left untouched" });
      continue;
    }
    const user = await User.create({
      name: spec.name,
      email: spec.email,
      provider: "password",
      role: spec.role, // assigned on the server; the API can never do this
      emailVerified: true,
    });
    await user.setPassword(spec.password);
    await user.save();
    created.push({ email: spec.email, role: spec.role });
  }
  return { ok: true, created, skipped };
}

async function run() {
  const result = await seedTestAccounts();
  if (!result.ok) {
    console.error(`✖ ${result.error}`);
    process.exit(1);
  }
  for (const c of result.created) console.log(`✔ Created ${c.role}: ${c.email}`);
  for (const s of result.skipped) console.log(`• Skipped ${s.email} (role: ${s.role}) — ${s.note}`);
  if (!result.created.length && !result.skipped.length) console.log("Nothing to do.");
  console.log("\nLog in at /login (Email & Password tab). Change these passwords after first use.");
}

if (require.main === module) {
  mongoose
    .connect(env.MONGO_URI)
    .then(run)
    .then(() => mongoose.disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { seedTestAccounts };
