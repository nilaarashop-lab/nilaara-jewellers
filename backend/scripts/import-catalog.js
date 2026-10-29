/**
 * One-time catalogue import: copies the frontend demo PRODUCTS catalogue into
 * MongoDB and re-hosts every product image on the configured remote storage
 * (ImageKit/Cloudinary) so the store never depends on external image hosts.
 * Re-runnable: existing products (matched by name) only get their images
 * refreshed; images already hosted on the storage CDN are skipped.
 *
 * Usage: node scripts/import-catalog.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Product = require("../models/Product");
const User = require("../models/User");
const { saveRemoteImage } = require("../lib/storage");

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await mongoose.connect(env.MONGO_URI);
  const { PRODUCTS } = await import("../../frontend/src/data/products.js");
  const admin = await User.findOne({ role: "admin" });
  if (!admin) throw new Error("No admin user found — run `npm run create-admin` first.");

  const uniqueUrls = [...new Set(PRODUCTS.flatMap((p) => p.images))];
  console.log(`Re-hosting ${uniqueUrls.length} unique images on ${env.STORAGE_DRIVER}…`);
  const cache = new Map();
  let failed = 0;
  for (const u of uniqueUrls) {
    if (new URL(u).host === "ik.imagekit.io") {
      cache.set(u, { url: u, publicId: "" });
      continue;
    }
    try {
      const meta = await saveRemoteImage(u);
      cache.set(u, { url: meta.url, publicId: meta.publicId });
      console.log("  ok ", meta.url);
    } catch (e) {
      failed++;
      cache.set(u, { url: u, publicId: "" }); // keep original URL so the store never breaks
      console.error("  FAIL", u, "-", e.message);
    }
    await sleep(250);
  }

  let created = 0;
  let updated = 0;
  for (const p of PRODUCTS) {
    const images = p.images.map((u) => {
      const m = cache.get(u);
      return { url: m.url, publicId: m.publicId, alt: "" };
    });
    const existing = await Product.findOne({ name: p.name });
    if (existing) {
      existing.images = images;
      existing.updatedBy = admin._id;
      await existing.save();
      updated++;
    } else {
      await Product.create({
        id: p.id,
        slug: slugify(p.name) + "-" + Date.now().toString(36),
        name: p.name,
        description: p.desc || "",
        category: p.category,
        collection: p.collection,
        plating: p.plating || "",
        stones: p.stones || "",
        price: p.price,
        mrp: p.mrp,
        badge: p.badge || "",
        tag: p.tag || "B1G1 Free",
        rating: p.rating || 0,
        reviews: p.reviews || 0,
        stock: 25,
        status: "published",
        images,
        publishedAt: new Date(),
        createdBy: admin._id,
        updatedBy: admin._id,
      });
      created++;
    }
  }
  console.log(`Done: ${created} created, ${updated} updated, ${failed} image fetch failure(s).`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
