/** Rupee text for the WhatsApp order message; the page uses formatINR. */
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

/**
 * The chain add-on as the customer picked it — "with" or "without" — or nothing
 * while they haven't chosen. Product pages and the WhatsApp message read this one
 * shape, so the price on screen and the price the shop sees can't drift apart.
 */
export const chainChoice = (product, picked) => {
  if (!product?.chainOption || (picked !== "with" && picked !== "without")) return null;
  const extra = Math.max(0, Number(product.chainCharge) || 0);
  const total = (Number(product.price) || 0) + (picked === "with" ? extra : 0);
  return {
    label: picked === "with" ? (extra > 0 ? `With chain (+${inr(extra)})` : "With chain") : "Without chain",
    total,
  };
};

/**
 * Extra lines for the "Buy Now" message carrying the chosen add-on and the total,
 * so the shop never has to guess which price the customer saw.
 */
export const choiceMessageLines = (product, picked) => {
  const choice = chainChoice(product, picked);
  return choice ? [`Chain: ${choice.label}`, `Total: ${inr(choice.total)}`] : [];
};
