/** Image content verification (magic bytes) — never trust client MIME types. */
const { test } = require("node:test");
const assert = require("node:assert");
const { detectImageFormat } = require("../lib/images");

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const gif = Buffer.from("GIF89a120030000000000ffff", "binary");
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WEBPVP8 ")]);
const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00", "binary");
const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");

test("detects JPEG", () => assert.equal(detectImageFormat(jpg), "jpg"));
test("detects PNG", () => assert.equal(detectImageFormat(png), "png"));
test("detects GIF", () => assert.equal(detectImageFormat(gif), "gif"));
test("detects WebP", () => assert.equal(detectImageFormat(webp), "webp"));
test("rejects an executable renamed to .jpg", () => assert.equal(detectImageFormat(exe), null));
test("rejects an SVG (stored-XSS vector)", () => assert.equal(detectImageFormat(svg), null));
test("rejects tiny/truncated buffers", () => {
  assert.equal(detectImageFormat(Buffer.alloc(4)), null);
  assert.equal(detectImageFormat(null), null);
});
