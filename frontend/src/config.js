/**
 * Storefront-wide settings.
 *
 * WhatsApp Business number: +91 96331 36081.
 * Every "Buy Now", header, footer and contact link reads from this one constant,
 * so this is the only place to change if the number changes.
 */
export const WHATSAPP_NUMBER = "919633136081"; // Nilaara WhatsApp Business number
export const WHATSAPP_DISPLAY = "+91 96331 36081";

/** A wa.me deep link with the message pre-filled for the customer. */
export const whatsappLink = (message) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

/** Generic "I need help" chat opened from the header / footer / contact page. */
export const whatsappChatLink = () =>
  whatsappLink("Hi Nilaara Jewellers! I'd like help choosing a piece from your website.");

/**
 * The message a shopper sends when they tap "Buy Now".
 *
 * Deliberately short: the WhatsApp Business auto-reply handles price,
 * availability, payment and shipping. All it needs to identify the piece is the
 * product name + the admin-assigned product ID, plus `extra` when the product
 * offered a choice (a chain, say) so the pick and its total travel with it.
 */
export const productEnquiryMessage = (p, extra = []) =>
  [
    "Hi Nilaara Jewellers! I'd like to buy this product.",
    `Product: ${p.name}`,
    `Product ID: ${p.id}`,
    ...extra,
  ].filter(Boolean).join("\n");

export const productEnquiryLink = (p, extra) => whatsappLink(productEnquiryMessage(p, extra));
