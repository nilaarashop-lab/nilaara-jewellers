/**
 * SAFE, REPEATABLE image migration to Cloudinary.
 *
 * What it does:
 *   1. Backs up every product document to backend/backup/ BEFORE touching anything.
 *   2. For each product image:
 *        - already has a Cloudinary publicId      → skipped (idempotent)
 *        - points at a local /uploads file        → uploaded to Cloudinary, Mongo updated
 *        - external URL (e.g. Unsplash)           → reported only, unless --import-external
 *   3. Produces a report (migrated / skipped / failed / manual attention).
 *
 * What it NEVER does:
 *   - delete original files from backend/uploads (kept until you verify + back up)
 *   - modify or delete products, orders or any other data
 *
 * Usage:
 *   npm run migrate-images                  (migrate local /uploads files only)
 *   npm run migrate-images -- --dry-run     (report only, no uploads, no writes)
 *   npm run migrate-images -- --import-external   (also re-host external URLs)
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const env = require("../config/env");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Asset = require("../models/Asset");
const { saveImageBuffer, saveRemoteImage } = require("../lib/storage");
const { detectImageFormat } = require("../lib/images");

const DRY = process.argv.includes("--dry-run");
const IMPORT_EXTERNAL = process.argv.includes("--import-external");
const UPLOADS_DIR = path.resolve(env.UPLOAD_DIR);

const report = { migrated: [], alreadyMigrated: [], externalSkipped: [], failed: [], manualAttention: [] };

function classify(url, publicId) {
  if (publicId) return "cloudinary";
  if (!url) return "missing";
  if (url.startsWith("/uploads/") || url.includes("/uploads/")) return "local";
  if (/^https?:\/\//.test(url)) return "external";
  return "unknown";
}

async function migrateLocalFile(url) {
  const name = path.basename(new URL(url, "http://x").pathname);
  const filePath = path.join(UPLOADS_DIR, name);
  const buf = await fsp.readFile(filePath);
  if (!detectImageFormat(buf)) throw new Error(`Not a valid image: ${name}`);
  const meta = await saveImageBuffer(buf);
  await Asset.create({ ...meta, kind: "product", uploadedBy: null });
  return meta;
}

async function run() {
  if (env.STORAGE_DRIVER !== "cloudinary") {
    console.error('STORAGE_DRIVER must be "cloudinary" in backend/.env before migrating.');
    process.exit(1);
  }
  await mongoose.connect(env.MONGO_URI);
  console.log(`Connected. ${DRY ? "DRY RUN — no changes will be written." : "Migrating…"}`);

  const products = await Product.find({});
  const backupDir = path.join(__dirname, "..", "backup");
  if (!DRY) {
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `products-images-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(products.map((p) => p.toObject()), null, 2));
    console.log(`Backup written: ${backupFile}`);
  }

  for (const p of products) {
    let changed = false;
    for (const img of p.images || []) {
      const before = img.url;
      const kind = classify(img.url, img.publicId);
      try {
        if (kind === "cloudinary") {
          report.alreadyMigrated.push({ product: p.id || String(p._id), url: img.url });
          continue;
        }
        if (kind === "missing") {
          report.manualAttention.push({ product: p.id || String(p._id), reason: "image entry with no URL" });
          continue;
        }
        if (kind === "local") {
          if (DRY) {
            report.migrated.push({ product: p.id || String(p._id), url: img.url, note: "dry-run" });
            continue;
          }
          const meta = await migrateLocalFile(img.url);
          img.url = meta.url;
          img.publicId = meta.publicId;
          changed = true;
          report.migrated.push({ product: p.id || String(p._id), from: before, to: meta.url });
          continue;
        }
        if (kind === "external") {
          if (!IMPORT_EXTERNAL) {
            report.externalSkipped.push({ product: p.id || String(p._id), url: img.url });
            continue;
          }
          if (DRY) {
            report.migrated.push({ product: p.id || String(p._id), url: img.url, note: "dry-run external" });
            continue;
          }
          const res = await saveRemoteImage(img.url);
          img.url = res.secure_url;
          img.publicId = res.public_id;
          changed = true;
          report.migrated.push({ product: p.id || String(p._id), from: before, to: res.secure_url });
          continue;
        }
        report.manualAttention.push({ product: p.id || String(p._id), url: img.url, reason: `unrecognized URL format (${kind})` });
      } catch (e) {
        report.failed.push({ product: p.id || String(p._id), url: img.url, error: e.message });
      }
    }
    if (changed && !DRY) {
      p.updatedAt = new Date();
      await p.save();
    }
  }

  // Products whose images are still not Cloudinary-hosted after this run.
  const remaining = await Product.find({ "images.url": /unsplash|^\/uploads\// });
  for (const p of remaining) {
    if (!report.manualAttention.some((m) => m.product === (p.id || String(p._id)))) {
      report.manualAttention.push({ product: p.id || String(p._id), reason: "still has non-Cloudinary images — re-run or replace manually in the admin panel" });
    }
  }

  console.log("\n──── MIGRATION REPORT ────");
  console.log(`migrated:        ${report.migrated.length}`);
  console.log(`already migrated:${report.alreadyMigrated.length}`);
  console.log(`external skipped:${report.externalSkipped.length}${IMPORT_EXTERNAL ? " (import enabled)" : " (use --import-external to re-host)"}`);
  console.log(`failed:          ${report.failed.length}`);
  console.log(`manual attention:${report.manualAttention.length}`);
  if (report.failed.length) console.log(JSON.stringify(report.failed, null, 2));
  if (report.manualAttention.length) console.log(JSON.stringify(report.manualAttention, null, 2));

  if (!DRY) {
    const reportFile = path.join(path.dirname(UPLOADS_DIR), "backup", `migration-report-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\nReport saved: ${reportFile}`);
    console.log("Originals in backend/uploads were NOT deleted. Verify the storefront, take a backup, then delete manually if desired.");
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
