const mongoose = require("mongoose");

const STATUSES = ["draft", "published", "archived"];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String, // storage asset id (Cloudinary public_id or local filename)
    alt: { type: String, default: "" },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Size 2.6", "Pair"
    sku: { type: String, sparse: true, unique: true },
    price: Number,
    mrp: Number,
    stock: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    // Legacy storefront id (e.g. "par-ethnic-kundan-choker") — kept so existing URLs keep working.
    id: { type: String, sparse: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, sparse: true, unique: true, trim: true },
    description: { type: String, default: "", maxlength: 5000 },

    category: { type: String, index: true }, // category slug
    collection: { type: String, index: true }, // collection slug

    // Jewellery attributes
    metal: { type: String, default: "Brass alloy" },
    purity: { type: String, default: "" }, // e.g. "24K gold plating"
    plating: { type: String, default: "" },
    stones: { type: String, default: "" },
    grossWeightG: { type: Number, min: 0 },
    netWeightG: { type: Number, min: 0 },
    size: { type: String, default: "" },
    variants: [variantSchema],

    // Pricing (INR). price = current selling price; mrp = maximum retail price.
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    makingCharges: { type: Number, default: 0, min: 0 },

    // Inventory
    stock: { type: Number, default: 0, min: 0 },
    trackInventory: { type: Boolean, default: true },
    lowStockThreshold: { type: Number, default: 5 },

    // Merchandising
    status: { type: String, enum: STATUSES, default: "draft", index: true },
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    badge: { type: String, default: "" },
    tag: { type: String, default: "" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },

    images: { type: [imageSchema], default: [] }, // images[0] = primary
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  // `collection` is a reserved Mongoose option name, but the field must keep
  // this name for API compatibility with the frontend and existing data.
  { timestamps: true, toJSON: { virtuals: false }, suppressReservedKeysWarning: true }
);

productSchema.index({ name: "text", description: "text" }); // safe text search (no regex injection)

/** Public storefront shape — keeps legacy field names (desc, inStock, images[] as URLs). */
productSchema.methods.toPublic = function toPublic() {
  return {
    id: this.id || String(this._id),
    _id: this._id,
    slug: this.slug,
    name: this.name,
    sku: this.sku,
    category: this.category,
    collection: this.collection,
    plating: this.plating,
    metal: this.metal,
    purity: this.purity,
    stones: this.stones,
    grossWeightG: this.grossWeightG,
    netWeightG: this.netWeightG,
    size: this.size,
    variants: this.variants.map((v) => ({ id: v._id, name: v.name, price: v.price, mrp: v.mrp, stock: v.stock })),
    price: this.price,
    mrp: this.mrp,
    makingCharges: this.makingCharges,
    rating: this.rating,
    reviews: this.reviews,
    badge: this.badge,
    tag: this.tag,
    featured: this.featured,
    bestseller: this.bestseller,
    newArrival: this.newArrival,
    images: this.images.map((i) => i.url),
    imageMeta: this.images.map((i) => ({ url: i.url, publicId: i.publicId, alt: i.alt })),
    desc: this.description,
    stock: this.stock,
    inStock: !this.trackInventory || this.stock > 0,
    status: this.status,
  };
};

/** Admin shape — everything including media metadata. */
productSchema.methods.toAdmin = function toAdmin() {
  return { ...this.toPublic(), trackInventory: this.trackInventory, lowStockThreshold: this.lowStockThreshold, status: this.status, createdAt: this.createdAt, updatedAt: this.updatedAt };
};

module.exports = mongoose.model("Product", productSchema);
module.exports.STATUSES = STATUSES;
