/** OTP core logic: normalization, CSPRNG generation, hashing, expiry, attempts. */
process.env.NODE_ENV = "test";
process.env.OTP_HASH_SECRET = "unit-test-secret";

const { test } = require("node:test");
const assert = require("node:assert");
const { normalizePhone, generateCode, hashOtp, verifyOtpHash, isExpired, attemptsExhausted, maskPhone } = require("../lib/otp/core");

test("normalizePhone accepts common Indian formats", () => {
  for (const input of ["9876543210", "+91 98765 43210", "09876543210", "91-98765-43210", "+919876543210", "0091 9876543210", "tel:+919876543210"]) {
    assert.equal(normalizePhone(input), "9876543210", `failed for ${input}`);
  }
});

test("normalizePhone rejects invalid numbers", () => {
  for (const input of ["12345", "987654321", "98765432101", "5876543210", "abcdefghij", "", null, undefined, 9876543210, "05876543210"]) {
    assert.equal(normalizePhone(input), null, `should reject ${String(input)}`);
  }
});

test("generateCode produces the configured length and only digits", () => {
  for (let i = 0; i < 50; i++) {
    const c = generateCode(6);
    assert.match(c, /^[0-9]{6}$/);
  }
  assert.match(generateCode(4), /^[0-9]{4}$/);
});

test("codes are random (not constant across calls)", () => {
  const codes = new Set(Array.from({ length: 20 }, () => generateCode(6)));
  assert.ok(codes.size > 15, "expected mostly unique codes");
});

test("hashOtp is deterministic for the same input and differs per phone/code", () => {
  assert.equal(hashOtp("9876543210", "123456"), hashOtp("9876543210", "123456"));
  assert.notEqual(hashOtp("9876543210", "123456"), hashOtp("9876543211", "123456"));
  assert.notEqual(hashOtp("9876543210", "123456"), hashOtp("9876543210", "123457"));
  assert.ok(!hashOtp("9876543210", "123456").includes("123456"), "hash must not contain the code");
});

test("verifyOtpHash accepts the right code and rejects wrong/malformed ones", () => {
  const stored = hashOtp("9876543210", "424242");
  assert.equal(verifyOtpHash("9876543210", "424242", stored), true);
  assert.equal(verifyOtpHash("9876543210", "424243", stored), false);
  assert.equal(verifyOtpHash("9876543211", "424242", stored), false); // wrong phone
  assert.equal(verifyOtpHash("9876543210", "424242", ""), false);
  assert.equal(verifyOtpHash("9876543210", "424242", null), false);
  assert.equal(verifyOtpHash("9876543210", "abcd42", stored), false); // non-digits
  assert.equal(verifyOtpHash("9876543210", "", stored), false);
  assert.equal(verifyOtpHash("9876543210", "12345678901234567", stored), false); // out-of-range length
});

test("isExpired compares against the challenge expiry", () => {
  const now = Date.now();
  assert.equal(isExpired({ expiresAt: new Date(now + 60_000) }, now), false);
  assert.equal(isExpired({ expiresAt: new Date(now - 1) }, now), true);
  assert.equal(isExpired(null, now), true);
});

test("attemptsExhausted enforces the attempt ceiling", () => {
  assert.equal(attemptsExhausted({ attempts: 4 }, 5), false);
  assert.equal(attemptsExhausted({ attempts: 5 }, 5), true);
  assert.equal(attemptsExhausted({ attempts: 6 }, 5), true);
  assert.equal(attemptsExhausted(null, 5), true);
});

test("maskPhone hides all but the first five digits", () => {
  assert.equal(maskPhone("9876543210"), "+91 98765•••••");
  assert.equal(maskPhone("bad"), "•••");
});
