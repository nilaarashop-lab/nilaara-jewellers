/**
 * Image reference safety: URL allow-list and Cloudinary folder guard.
 * Environment must be set BEFORE the config module loads.
 */
process.env.ALLOWED_IMAGE_HOSTS = "images.unsplash.com";
process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert");
const { isAllowedImageUrl, ownsCloudinaryFolder, normalizeImages } = require("../lib/imageRefs");

test("allows Cloudinary HTTPS URLs", () => {
  assert.ok(isAllowedImageUrl("https://res.cloudinary.com/demo/image/upload/nilaara/products/x.jpg"));
});

test("allows explicitly allow-listed hosts (legacy Unsplash)", () => {
  assert.ok(isAllowedImageUrl("https://images.unsplash.com/photo-123?w=800"));
});

test("rejects arbitrary external hosts (upload bypass)", () => {
  assert.equal(isAllowedImageUrl("https://evil.example.com/x.jpg"), null);
});

test("rejects non-HTTPS URLs", () => {
  assert.equal(isAllowedImageUrl("http://res.cloudinary.com/x.jpg"), null);
  assert.equal(isAllowedImageUrl("javascript:alert(1)"), null);
});

test("rejects malformed input", () => {
  assert.equal(isAllowedImageUrl(""), null);
  assert.equal(isAllowedImageUrl(null), null);
  assert.equal(isAllowedImageUrl("not a url"), null);
});

test("folder guard accepts only our own nilaara/ assets", () => {
  assert.ok(ownsCloudinaryFolder("nilaara/products/nil-abc123"));
  assert.equal(ownsCloudinaryFolder("otherfolder/x"), false);
  assert.equal(ownsCloudinaryFolder("../../etc/passwd"), false);
  assert.equal(ownsCloudinaryFolder(""), false);
});

test("normalizeImages whitelists and reports rejected entries", () => {
  const { images, rejected } = normalizeImages([
    "https://res.cloudinary.com/demo/image/upload/a.jpg",
    "https://evil.example.com/b.jpg",
    { url: "https://res.cloudinary.com/demo/image/upload/c.jpg", publicId: "nilaara/products/c", alt: "ring" },
    12345,
  ]);
  assert.equal(images.length, 2);
  assert.equal(images[1].alt, "ring");
  assert.equal(rejected.length, 2);
});
