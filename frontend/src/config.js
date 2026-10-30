/**
 * Storefront-wide settings.
 *
 * ⚠️ WhatsApp number: replace WHATSAPP_NUMBER with the real business number
 * (country code first, digits only — e.g. 919876543210). Every "Buy Now",
 * header, footer and contact link reads from this one constant, so this is the
 * only place you need to change when the real number is ready.
 */
export const WHATSAPP_NUMBER = "919800000000"; // TODO: real Nilaara WhatsApp number
export const WHATSAPP_DISPLAY = "+91 98XXXXXXXX";

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
 * product name + the admin-assigned product ID.
 */
export const productEnquiryMessage = (p) =>
  [
    "Hi Nilaara Jewellers! I'd like to buy this product.",
    `Product: ${p.name}`,
    `Product ID: ${p.id}`,
  ].join("\n");

export const productEnquiryLink = (p) => whatsappLink(productEnquiryMessage(p));
