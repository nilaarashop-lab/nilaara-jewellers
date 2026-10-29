/**
 * One-time administrator setup. This is the ONLY way to create an admin account —
 * the API's public registration always produces "customer" accounts.
 *
 * Usage:
 *   npm run create-admin -- --email=you@example.com --password=ChooseAStrongPass --name="Your Name"
 *   npm run create-admin                      (interactive)
 *   npm run create-admin -- --reset-password  (rotate password of an existing admin)
 */
const path = require("path");
const readline = require("readline");
const env = require("../config/env");
const mongoose = require("mongoose");
const User = require("../models/User");

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

async function ask(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (silent) {
      // Hide password input.
      const onData = (char) => {
        if (char.toString() === "\n" || char.toString() === "\r") process.stdout.write("\n");
        else process.stdout.write("*");
      };
      process.stdin.on("data", onData);
      rl.question(question, (answer) => {
        process.stdin.removeListener("data", onData);
        resolve(answer.trim());
      });
    } else {
      rl.question(question, (answer) => resolve(answer.trim()));
    }
  });
}

async function run() {
  const errors = env.validateEnv().filter((e) => !e.startsWith("STORAGE_DRIVER")); // storage can be configured later
  if (errors.length) {
    console.error("Configuration problems:\n" + errors.map((e) => "  • " + e).join("\n"));
    process.exit(1);
  }
  await mongoose.connect(env.MONGO_URI);

  const reset = process.argv.includes("--reset-password");
  let email = arg("email");
  let password = arg("password");
  let name = arg("name");

  if (!email) email = await ask("Admin email: ");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Invalid email.");
    process.exit(1);
  }

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user && !reset) {
    console.log(`\nAn account for ${email} already exists (role: ${user.role}).`);
    if (user.role !== "admin") {
      user.role = "admin";
      await user.save();
      console.log("Promoted existing account to admin.");
    } else {
      console.log("Nothing to do. Use --reset-password to rotate the password.");
    }
    await mongoose.disconnect();
    return;
  }

  if (!password) password = await ask("Admin password (min 10 chars): ", { silent: true });
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  if (!name) name = email.split("@")[0];

  if (user) {
    await user.setPassword(password);
    user.role = "admin";
    user.status = "active";
    await user.save();
    console.log(`\n✔ Password reset and role set to admin for ${email}`);
  } else {
    user = await User.create({ name, email: email.toLowerCase(), provider: "password", role: "admin", emailVerified: true });
    await user.setPassword(password);
    await user.save();
    console.log(`\n✔ Admin account created for ${email}`);
  }
  console.log("Log in at /admin with these credentials.");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
