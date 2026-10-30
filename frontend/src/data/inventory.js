/**
 * One sold-out rule for the whole storefront.
 *
 * A piece is sold out only when stock is tracked AND a count was recorded AND
 * that count is zero. An entry saved before stock tracking existed has no
 * count, so it stays available instead of silently disappearing from sale.
 */

export const tracksStock = (product) => product.trackInventory !== false;

export const hasStockCount = (product) => {
  const value = product.stock;
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
};

export const stockCount = (product) => (hasStockCount(product) ? Number(product.stock) : null);

export const isSoldOut = (product) => {
  if (!tracksStock(product) || !hasStockCount(product)) return false;
  return Number(product.stock) <= 0;
};

export const isLowStock = (product) => {
  if (isSoldOut(product) || !tracksStock(product) || !hasStockCount(product)) return false;
  return Number(product.stock) <= Number(product.lowStockThreshold ?? 5);
};
