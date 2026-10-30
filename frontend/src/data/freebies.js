/**
 * Storefront copy for the freebie threshold. Every page that mentions it reads
 * this, so changing the number in the admin changes every mention at once.
 * Returns "" when no threshold is set, so callers can drop the sentence.
 */
export const freebiesLabel = (settings) => {
  const amount = Number(settings?.shipping?.freeOver);
  return amount > 0 ? `Freebies over ₹${amount.toLocaleString("en-IN")}` : "";
};
