/** Admin dashboard statistics — staff/admin only (no public revenue disclosure). */
const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../lib/apiError");

const router = express.Router();

router.get(
  "/",
  requireRole("admin", "staff"),
  asyncHandler(async (_req, res) => {
    const [products, orderCount, revenueAgg, byStatus, lowStock] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $nin: ["cancelled", "returned", "refunded"] } } },
        { $group: { _id: null, revenue: { $sum: "$totals.total" } } },
      ]),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Product.find({ trackInventory: true, stock: { $lte: 5 } }).select("name stock id").limit(10).lean(),
    ]);
    const byStatusMap = {};
    for (const row of byStatus) byStatusMap[row._id || "placed"] = row.count;
    res.json({
      products,
      orders: orderCount,
      revenue: revenueAgg[0]?.revenue || 0,
      byStatus: byStatusMap,
      lowStock,
    });
  })
);

module.exports = router;
