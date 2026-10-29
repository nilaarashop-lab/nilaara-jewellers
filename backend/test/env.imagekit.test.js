/**
 * Unit tests: ImageKit storage configuration (config/env.js validation,
 * image-host allowlist) and library-asset ownership checks for ImageKit
 * fileIds (lib/imageRefs.js). Pure unit tests — no database, no app boot.
 *
 * config/env.js is a require-time singleton, so each test mutates the env
 * object and restores it afterwards (snapshot/restore of every key touched).
 */
process.env.NODE_ENV = "test";
process.env.OTP_PROVIDER = "";
process.env.RAZORPAY_KEY_ID = "";
process.env.RAZORPAY_KEY_SECRET = "";
process.env.GOOGLE_CLIENT_ID = "";

const { test } = require("node:test");
const assert = require("node:assert");
const env = require("../config/env");
const { isAllowedImageUrl, ownsLibraryAsset } = require("../lib/imageRefs");

/** Saves every env.js key a test may touch, and restores after. */
const KEYS = [
  "MONGO_URI", "isProd", "STORAGE_DRIVER", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET", "IMAGEKIT_PRIVATE_KEY", "IMAGEKIT_URL_ENDPOINT",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "COOKIE_SECURE", "GOOGLE_CLIENT_ID",
  "OTP_PROVIDER", "OTP_TTL_SECONDS", "OTP_MAX_ATTEMPTS",
];
const snapshot = () => {
  const s = {};
  for (const k of KEYS) s[k] = env[k];
  return s;
};
const restore = (s) => {
  for (const k of KEYS) env[k] = s[k];
};

/** Clear base config that validates cleanly, with the storage driver to test. */
function baseConfig(driver, over = {}) {
  env.MONGO_URI = "mongodb+srv://test:pw@jewellery.js4pnyv.mongodb.net/parinaya";
  env.isProd = false;
  env.STORAGE_DRIVER = driver;
  env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  env.CLOUDINARY_API_KEY = "test-key";
  env.CLOUDINARY_API_SECRET = "test-secret";
  env.IMAGEKIT_PRIVATE_KEY = "ik_test_private_key";
  env.IMAGEKIT_URL_ENDPOINT = "";
  env.COOKIE_SECURE = false;
  Object.assign(env, over);
}

test(`STORAGE_DRIVER=imagekit validates when the private key is present`, () => {
  const s = snapshot();
  try {
    baseConfig("imagekit");
    assert.deepEqual(env.validateEnv(), []);
    // Default ImageKit CDN host + configured endpoint are allow-listed.
    assert.ok(env.imageHostAllowlist().includes("ik.imagekit.io"));
    env.IMAGEKIT_URL_ENDPOINT = "https://cdn.nilaara.example";
    assert.ok(env.imageHostAllowlist().includes("cdn.nilaara.example"));
    assert.ok(isAllowedImageUrl("https://ik.imagekit.io/acme/nilaara/products/nil-x.jpg"));
    assert.equal(isAllowedImageUrl("https://not-allowlisted.example/img.jpg"), null);
  } finally {
    restore(s);
  }
});

test("STORAGE_DRIVER=imagekit without a private key is a fatal configuration error", () => {
  const s = snapshot();
  try {
    baseConfig("imagekit", { IMAGEKIT_PRIVATE_KEY: "" });
    const errs = env.validateEnv();
    assert.equal(errs.length, 1);
    assert.match(errs[0], /IMAGEKIT_PRIVATE_KEY/);
  } finally {
    restore(s);
  }
});

test("non-https IMAGEKIT_URL_ENDPOINT is rejected", () => {
  const s = snapshot();
  try {
    baseConfig("imagekit", { IMAGEKIT_URL_ENDPOINT: "http://cdn.nilaara.example" });
    const errs = env.validateEnv();
    assert.equal(errs.length, 1);
    assert.match(errs[0], /IMAGEKIT_URL_ENDPOINT/);
  } finally {
    restore(s);
  }
});

test("STORAGE_DRIVER accepts only local, cloudinary or imagekit", () => {
  const s = snapshot();
  try {
    baseConfig("s3");
    const errs = env.validateEnv();
    assert.equal(errs.length, 1);
    assert.match(errs[0], /STORAGE_DRIVER/);
    // The Cloudinary branch must still fail when its own keys are missing.
    baseConfig("cloudinary", { CLOUDINARY_API_SECRET: "" });
    assert.ok(env.validateEnv().some((e) => /CLOUDINARY_API_SECRET/.test(e)));
  } finally {
    restore(s);
  }
});

test("ownsLibraryAsset recognises Cloudinary folder paths and ImageKit fileIds", () => {
  assert.ok(ownsLibraryAsset("nilaara/products/nil-abc123")); // cloudinary
  assert.ok(ownsLibraryAsset("621719af7cf9a5ba44e79efc")); // imagekit fileId (24-hex)
  assert.ok(ownsLibraryAsset(" 621719AF7CF9A5BA44E79EFC ")); // trimmed, case-insensitive
  assert.equal(ownsLibraryAsset("otherfolder/x"), false);
  assert.equal(ownsLibraryAsset("../../etc/passwd"), false);
  assert.equal(ownsLibraryAsset(""), false);
  assert.equal(ownsLibraryAsset(undefined), false);
  assert.equal(ownsLibraryAsset("621719af7cf9a5ba44e79ef"), false); // 23 chars
  assert.equal(ownsLibraryAsset("g21719af7cf9a5ba44e79efc"), false); // non-hex
});
