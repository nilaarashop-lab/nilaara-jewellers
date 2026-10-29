require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const Product = require("../models/Product");

// Mirror of the frontend demo catalogue — seeded once into MongoDB.
// Idempotent: upserts by legacy `id`, so re-running never duplicates.
// Existing product identifiers (par-…) are preserved so current URLs keep working.
const SEED = [
  { id: "par-ethnic-kundan-choker", name: "Rajwadi Kundan Pearl Choker Necklace Set", slug: "rajwadi-kundan-pearl-choker-necklace-set", sku: "NIL-KUN-001", category: "jewellery-sets", collection: "kundan", plating: "22K Gold Plated", stones: "Kundan • Pearls", price: 1149, mrp: 3475, rating: 4.6, reviews: 2314, badge: "Bestseller", tag: "", stock: 50, images: ["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop"], desc: "Handcrafted festive choker with kundan polki and pearls." },
  { id: "par-temple-lakshmi-bangle", name: "Divine Lakshmi Temple Bangles — Set of 2", slug: "divine-lakshmi-temple-bangles-set-of-2", sku: "NIL-TEM-002", category: "bangles", collection: "temple", plating: "24K Gold Plated", stones: "Ruby • Emerald", price: 1299, mrp: 2569, rating: 4.4, reviews: 1180, badge: "Bestseller", tag: "", stock: 40, images: ["https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=800&auto=format&fit=crop"], desc: "Temple-work bangles with Lakshmi motif." },
  { id: "par-tribal-necklace-set", name: "Tribal Magic Green & Red Necklace Set", slug: "tribal-magic-green-red-necklace-set", sku: "NIL-OXI-003", category: "necklaces", collection: "oxidised", plating: "Antique Gold Oxidised", stones: "Crystal • Beads", price: 1299, mrp: 2569, rating: 4.2, reviews: 864, badge: "New", tag: "", stock: 35, images: ["https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=800&auto=format&fit=crop"], desc: "Oxidised tribal set." },
  { id: "par-rose-gold-bracelet", name: "American Diamond Zirconia Rose-Gold Bracelet", slug: "american-diamond-zirconia-rose-gold-bracelet", sku: "NIL-AD-004", category: "bangles", collection: "american-diamond", plating: "Rose Gold Plated", stones: "Cubic Zirconia", price: 1249, mrp: 2429, rating: 4.5, reviews: 1932, badge: "Bestseller", tag: "", stock: 60, images: ["https://images.unsplash.com/photo-1610694955371-d4a3e0ce4b52?q=80&w=800&auto=format&fit=crop"], desc: "Demi-fine bracelet." },
  { id: "par-kashmiri-jhumka", name: "Long Kashmiri Jhumkas with Gold Beads", slug: "long-kashmiri-jhumkas-with-gold-beads", sku: "NIL-TEM-005", category: "jhumkas", collection: "temple", plating: "22K Gold Plated", stones: "Pearl • Meenakari", price: 799, mrp: 1650, rating: 4.7, reviews: 1780, badge: "Bestseller", tag: "", stock: 80, images: ["https://images.unsplash.com/photo-1617038220319-276d3cfab638?q=80&w=800&auto=format&fit=crop"], desc: "Long festive jhumkas." },
];

async function run() {
  const uri = env.MONGO_URI;
  await mongoose.connect(uri);
  let created = 0;
  let updated = 0;
  for (const s of SEED) {
    const { images, desc, ...rest } = s;
    const doc = {
      ...rest,
      description: desc,
      images: images.map((url) => ({ url, publicId: "", alt: s.name })), // external URLs; migrate with `npm run migrate-images -- --import-external`
      status: "published",
      trackInventory: true,
    };
    // Upsert by legacy id. NOTE: `doc` already contains `id` and the filter
    // supplies it on insert — a $setOnInsert for the same path makes MongoDB
    // reject the first-ever run with "Updating the path 'id' would create a
    // conflict at 'id'", so only $set is used here.
    const res = await Product.updateOne({ id: s.id }, { $set: doc }, { upsert: true });
    if (res.upsertedCount) created++;
    else updated++;
  }
  console.log(`Seed complete: ${created} created, ${updated} updated (of ${SEED.length}) in ${uri.replace(/\/\/[^@]*@/, "//***@")}`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
