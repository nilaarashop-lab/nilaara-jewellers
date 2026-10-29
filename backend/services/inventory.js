/**
 * Inventory service — atomic, conditional stock updates so concurrent checkouts
 * can never oversell or double-deduct. Every change is recorded.
 *
 * Each line carries a `track` flag: legacy products that were created before the
 * stock field existed (raw doc has no `stock`) are treated as untracked, so old
 * catalogue data keeps selling after the migration.
 */
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");
const { HttpError } = require("../lib/apiError");

/**
 * Atomically decrements stock for each tracked line. Rolls back on partial failure.
 * @param {Array<{_id:ObjectId,id:string,name:string,qty:number,track?:boolean}>} lines
 * @param {{orderId?:ObjectId, by?:ObjectId}} meta
 */
async function reserveStock(lines, meta = {}) {
  const decremented = [];
  try {
    for (const line of lines) {
      if (line.track === false) continue;
      const updated = await Product.findOneAndUpdate(
        { _id: line._id, stock: { $gte: line.qty } },
        { $inc: { stock: -line.qty } },
        { new: true }
      );
      if (!updated) {
        throw new HttpError(409, `Insufficient stock for "${line.name}" — please reduce the quantity.`);
      }
      decremented.push({ product: line._id, qty: line.qty, stockAfter: updated.stock });
      await InventoryMovement.create({
        product: line._id,
        productId: line.id,
        delta: -line.qty,
        stockAfter: updated.stock,
        reason: "order",
        order: meta.orderId,
        by: meta.by,
      });
    }
    return true;
  } catch (e) {
    // Compensating rollback for lines already decremented in this request.
    for (const d of decremented) {
      await Product.updateOne({ _id: d.product }, { $inc: { stock: d.qty } });
      await InventoryMovement.create({
        product: d.product,
        delta: d.qty,
        stockAfter: d.stockAfter + d.qty,
        reason: "restock",
        order: meta.orderId,
        by: meta.by,
        note: "rollback",
      });
    }
    throw e;
  }
}

/** Returns stock to products (cancellation/refund). */
async function releaseStock(lines, meta = {}) {
  for (const line of lines) {
    if (line.track === false) continue;
    const updated = await Product.findOneAndUpdate({ _id: line._id }, { $inc: { stock: line.qty } }, { new: true });
    await InventoryMovement.create({
      product: line._id,
      productId: line.id,
      delta: line.qty,
      stockAfter: updated ? updated.stock : undefined,
      reason: meta.reason || "restock",
      order: meta.orderId,
      by: meta.by,
      note: meta.note,
    });
  }
}

module.exports = { reserveStock, releaseStock };
