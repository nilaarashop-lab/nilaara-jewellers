const mongoose = require("mongoose");

/**
 * Homepage CMS sections. Each document is one section of the storefront homepage.
 * The public endpoint returns only active, currently-scheduled sections.
 */
const SECTION_TYPES = ["hero", "trust", "categories", "collections", "products", "promo", "festive", "testimonial", "instagram", "stores", "announcement"];

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true }, // stable id, e.g. "hero-main"
    type: { type: String, enum: SECTION_TYPES, required: true },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    body: { type: String, default: "" },
    ctaLabel: { type: String, default: "" },
    ctaLink: { type: String, default: "" },
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    mobileImage: { type: String, default: "" },
    // For "products" sections: explicit product ids (legacy storefront ids).
    productIds: { type: [String], default: [] },
    // For "categories"/"collections" sections: limit to specific slugs (empty = all active).
    slugs: { type: [String], default: [] },
    extra: { type: Object, default: {} }, // small type-specific fields (quote author, countdown label, etc.)
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sectionSchema.virtual("isScheduledNow").get(function isScheduledNow() {
  const now = Date.now();
  if (this.startsAt && this.startsAt.getTime() > now) return false;
  if (this.endsAt && this.endsAt.getTime() < now) return false;
  return true;
});

const Homepage = mongoose.model("HomepageSection", sectionSchema);
module.exports = Homepage;
module.exports.SECTION_TYPES = SECTION_TYPES;
