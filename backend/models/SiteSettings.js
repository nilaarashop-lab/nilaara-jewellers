const mongoose = require("mongoose");

/**
 * Single-document site settings ("site" key): announcement bar (marquee),
 * homepage content (hero slides, promo cards, festive banner), contact details,
 * shipping rules, coupons, tax, store locations.
 * Public endpoint returns only the storefront-safe subset.
 */
const storeSchema = new mongoose.Schema(
  {
    name: String,
    address: String,
    hours: String,
    phone: String,
    coords: String,
    mapsUrl: String,
  },
  { _id: false }
);

/** Image reference stored only after the upload/approved-host validation. */
const imageRefSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" }, // Cloudinary/local asset id (for cleanup)
    alt: { type: String, default: "", maxlength: 200 },
  },
  { _id: false }
);

const heroSlideSchema = new mongoose.Schema(
  {
    image: { type: imageRefSchema, default: () => ({}) },
    eyebrow: { type: String, default: "", maxlength: 60 },
    title: { type: String, default: "", maxlength: 120 },
    highlight: { type: String, default: "", maxlength: 120 }, // gold italic second line
    text: { type: String, default: "", maxlength: 400 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const homeCardSchema = new mongoose.Schema(
  {
    image: { type: imageRefSchema, default: () => ({}) },
    eyebrow: { type: String, default: "", maxlength: 60 },
    title: { type: String, default: "", maxlength: 80 },
    text: { type: String, default: "", maxlength: 160 },
    to: { type: String, default: "/shop", maxlength: 200 },
    linkLabel: { type: String, default: "Shop now →", maxlength: 40 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

/** Home-page tile image override ("Shop by Category" / "Handpicked" sections). */
const homeTileSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, maxlength: 60 },
    image: { type: imageRefSchema, default: () => ({}) },
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "site", unique: true },
    announcement: {
      text: { type: String, default: "Buy 1 Get 1 Free • Sitewide • Flat 25% off + Free shipping over ₹999" },
      shortText: { type: String, default: "Buy 1 Get 1 Free • Flat 25% off" },
      active: { type: Boolean, default: true },
      // Scrolling marquee lines shown in the announcement bar (fallback: text/shortText).
      messages: {
        type: [
          {
            _id: false,
            text: { type: String, required: true, maxlength: 160 },
            active: { type: Boolean, default: true },
          },
        ],
        default: [],
      },
    },
    home: {
      // Auto-rotating hero slides (storefront falls back to built-in defaults
      // when none are active). Max 4 enforced by the admin schema.
      heroSlides: { type: [heroSlideSchema], default: [] },
      // Promo cards shown beside/under the hero ("bento" strip).
      cards: { type: [homeCardSchema], default: [] },
      // Festive/offer banner image (text stays themed in the storefront).
      festive: {
        image: { type: imageRefSchema, default: () => ({}) },
        active: { type: Boolean, default: false },
      },
      // Per-tile image overrides for "Shop by Category" (categoryTiles) and
      // "Handpicked for you" (collectionTiles), keyed by the catalogue slug.
      // The storefront falls back to the built-in image when absent.
      categoryTiles: { type: [homeTileSchema], default: [] },
      collectionTiles: { type: [homeTileSchema], default: [] },
    },
    brand: {
      phone: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
      cin: { type: String, default: "" },
      hours: { type: String, default: "10:30 AM – 5:30 PM, Mon–Sat" },
    },
    shipping: {
      freeOver: { type: Number, default: 999 },
      fee: { type: Number, default: 79 },
      // Delivery options shown at checkout. Empty list → a single "Standard
      // Delivery" option derived from fee/freeOver above. Fees/ETAs are ONLY
      // ever shown to customers when they are actually configured here.
      methods: {
        type: [
          {
            _id: false,
            id: { type: String, required: true },
            label: { type: String, required: true, maxlength: 60 },
            fee: { type: Number, required: true, min: 0 },
            etaMinDays: { type: Number, min: 0 },
            etaMaxDays: { type: Number, min: 0 },
            enabled: { type: Boolean, default: true },
          },
        ],
        default: [],
      },
    },
    coupons: {
      flat25: { enabled: { type: Boolean, default: true }, minSubtotal: { type: Number, default: 1000 }, percent: { type: Number, default: 25 } },
      b1g1: { enabled: { type: Boolean, default: false }, minItems: { type: Number, default: 2 } },
    },
    tax: {
      ratePct: { type: Number, default: 3 }, // confirm with your CA for your product category
      inclusive: { type: Boolean, default: true }, // MRP-inclusive pricing as displayed on the storefront
    },
    stores: { type: [storeSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

/** Public, storefront-safe subset (no internal flags). */
siteSettingsSchema.methods.toPublic = function toPublic() {
  const activeSlides = (this.home?.heroSlides || [])
    .filter((s) => s.active !== false && (s.title || s.image?.url))
    .slice(0, 4)
    .map((s) => ({
      image: s.image?.url ? { url: s.image.url, alt: s.image.alt || "" } : null,
      eyebrow: s.eyebrow || "",
      title: s.title || "",
      highlight: s.highlight || "",
      text: s.text || "",
    }));
  const activeCards = (this.home?.cards || [])
    .filter((c) => c.active !== false && (c.title || c.image?.url))
    .slice(0, 4)
    .map((c) => ({
      image: c.image?.url ? { url: c.image.url, alt: c.image.alt || "" } : null,
      eyebrow: c.eyebrow || "",
      title: c.title || "",
      text: c.text || "",
      to: c.to || "/shop",
      linkLabel: c.linkLabel || "Shop now →",
    }));
  const marquee = (this.announcement.messages || []).filter((m) => m.active !== false && m.text);
  const tiles = (list) =>
    (list || [])
      .filter((t) => t.image?.url)
      .map((t) => ({ slug: t.slug, url: t.image.url, alt: t.image.alt || "" }));
  return {
    announcement: this.announcement.active
      ? {
          text: this.announcement.text,
          shortText: this.announcement.shortText,
          messages: marquee.map((m) => m.text),
        }
      : null,
    home: {
      heroSlides: activeSlides,
      cards: activeCards,
      festive: this.home?.festive?.active
        ? { url: this.home.festive.image?.url || "", alt: this.home.festive.image?.alt || "", active: true }
        : null,
      categoryTiles: tiles(this.home?.categoryTiles),
      collectionTiles: tiles(this.home?.collectionTiles),
    },
    brand: this.brand,
    shipping: {
      freeOver: this.shipping.freeOver,
      fee: this.shipping.fee,
      methods: this.shipping.methods
        .filter((m) => m.enabled)
        .map((m) => ({ id: m.id, label: m.label, fee: m.fee, etaMinDays: m.etaMinDays, etaMaxDays: m.etaMaxDays })),
    },
    coupons: {
      flat25: { enabled: this.coupons.flat25.enabled, minSubtotal: this.coupons.flat25.minSubtotal, percent: this.coupons.flat25.percent },
      b1g1: { enabled: this.coupons.b1g1.enabled, minItems: this.coupons.b1g1.minItems },
    },
    tax: this.tax,
    stores: this.stores,
  };
};

siteSettingsSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: "site" });
  if (!doc) doc = await this.create({ key: "site" });
  return doc;
};

module.exports = mongoose.model("SiteSettings", siteSettingsSchema);
