/**
 * Google account-linking policy (pure) + token verification guard rails.
 * The policy is the security boundary that prevents account takeover and
 * privilege escalation through Google sign-in.
 */
process.env.NODE_ENV = "test";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";

const { test } = require("node:test");
const assert = require("node:assert");
const { planAccount, verifyGoogleToken } = require("../lib/google");

const SUB = "google-sub-1234567890";
const EMAIL = "customer@example.com";

test("unknown Google identity creates a CUSTOMER account (never admin)", () => {
  const plan = planAccount({ sub: SUB, email: EMAIL, name: "Aarohi" }, {});
  assert.equal(plan.action, "create");
  assert.equal(plan.patch.role, "customer");
  assert.equal(plan.patch.googleId, SUB);
  assert.equal(plan.patch.provider, "google");
  assert.equal(plan.patch.emailVerified, true);
  assert.equal(plan.patch.email, EMAIL);
});

test("known googleId signs in to that account", () => {
  const existing = { _id: "u1", googleId: SUB, role: "customer" };
  const plan = planAccount({ sub: SUB, email: EMAIL }, { byGoogleId: existing });
  assert.equal(plan.action, "login");
  assert.equal(plan.user, existing);
});

test("verified email links an existing CUSTOMER account to Google", () => {
  const customer = { _id: "u2", role: "customer", email: EMAIL, googleId: undefined };
  const plan = planAccount({ sub: SUB, email: EMAIL }, { byEmail: customer });
  assert.equal(plan.action, "link");
  assert.equal(plan.user, customer);
  assert.equal(plan.patch.googleId, SUB);
  assert.equal(plan.patch.emailVerified, true);
});

test("linking never touches the account role (no privilege grant)", () => {
  const customer = { _id: "u3", role: "customer" };
  const plan = planAccount({ sub: SUB, email: EMAIL }, { byEmail: customer });
  assert.equal(plan.patch.role, undefined); // role is not part of the patch at all
});

test("staff/admin accounts can NEVER be accessed or linked via Google", () => {
  for (const role of ["admin", "staff"]) {
    const plan = planAccount({ sub: SUB, email: "boss@nilaara.com" }, { byEmail: { _id: "u4", role } });
    assert.equal(plan.action, "error", `${role} must be refused`);
    assert.equal(plan.status, 403);
  }
});

test("an email already tied to a DIFFERENT googleId is refused (takeover guard)", () => {
  const plan = planAccount({ sub: SUB, email: EMAIL }, { byEmail: { _id: "u5", role: "customer", googleId: "some-other-sub" } });
  assert.equal(plan.action, "error");
  assert.equal(plan.status, 409);
});

test("re-linking the same googleId to the same account is treated as login", () => {
  const same = { _id: "u6", role: "customer", googleId: SUB };
  const plan = planAccount({ sub: SUB, email: EMAIL }, { byGoogleId: same, byEmail: same });
  assert.equal(plan.action, "login");
});

test("missing sub is rejected", () => {
  const plan = planAccount({ email: EMAIL }, {});
  assert.equal(plan.action, "error");
  assert.equal(plan.status, 400);
});

test("verifyGoogleToken rejects malformed tokens (never trusts them)", async () => {
  await assert.rejects(() => verifyGoogleToken("not-a-real-token-but-long-enough-xxxx"), /could not be verified|Invalid/);
  await assert.rejects(() => verifyGoogleToken(""), /Invalid Google credential/);
  await assert.rejects(() => verifyGoogleToken(null), /Invalid Google credential/);
  await assert.rejects(() => verifyGoogleToken(12345), /Invalid Google credential/);
});
