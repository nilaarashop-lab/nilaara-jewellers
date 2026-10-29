const mongoose = require("mongoose");

/** Every stock change is recorded for reconciliation. */
const inventoryMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productId: String,
    delta: { type: Number, required: true }, // negative = decrease
    stockAfter: Number,
    reason: { type: String, enum: ["order", "cancel", "restock", "adjustment", "seed"], required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryMovement", inventoryMovementSchema);
