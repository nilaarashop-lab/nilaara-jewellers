/**
 * Image content verification (magic bytes) — never trust client-declared MIME types.
 * Supported: JPEG, PNG, WebP, GIF.
 */
const SIGNATURES = [
  { format: "jpg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { format: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  { format: "gif", bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
];
// WebP: "RIFF" .... "WEBP"
function isWebp(buf) {
  return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

const EXT = { jpg: ".jpg", png: ".png", gif: ".gif", webp: ".webp" };

/** Returns detected format string or null. */
function detectImageFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (isWebp(buf)) return "webp";
  for (const s of SIGNATURES) {
    if (buf.slice(s.offset, s.offset + s.bytes.length).every((b, i) => b === s.bytes[i])) return s.format;
  }
  return null;
}

module.exports = { detectImageFormat, EXT };
