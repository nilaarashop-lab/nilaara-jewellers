import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import handler, { AUTH_TTL_SECONDS, uploadAuth } from "../api/imagekit.js";

const saved = {};
const setEnv = (name, value) => {
  if (!(name in saved)) saved[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};
const restoreEnv = () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    delete saved[name];
  }
};

afterEach(restoreEnv);

const fakeRes = () => ({
  statusCode: 0,
  headers: {},
  body: "",
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  end(body) {
    this.body = body;
  },
});

test("upload auth signs token + expiry the way ImageKit expects", () => {
  const auth = uploadAuth(
    { privateKey: "test_private", publicKey: "public_x", urlEndpoint: "https://ik.imagekit.io/demo/" },
    { now: 1_700_000_000_000, token: "abc123" }
  );
  assert.equal(auth.expire, 1_700_000_000 + AUTH_TTL_SECONDS);
  const expected = crypto
    .createHmac("sha1", "test_private")
    .update(`abc123${auth.expire}`)
    .digest("hex");
  assert.equal(auth.signature, expected);
  assert.equal(auth.urlEndpoint, "https://ik.imagekit.io/demo");
  assert.equal(auth.configured, true);
});

test("without ImageKit keys the endpoint reports it is not configured", async () => {
  setEnv("IMAGEKIT_PRIVATE_KEY", undefined);
  setEnv("IMAGEKIT_PUBLIC_KEY", undefined);
  const res = fakeRes();
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { configured: false });
});

test("configured but no GitHub token is refused", async () => {
  setEnv("IMAGEKIT_PRIVATE_KEY", "test_private");
  setEnv("IMAGEKIT_PUBLIC_KEY", "public_x");
  const res = fakeRes();
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).message, /GitHub/);
});

test("only POST is accepted", async () => {
  const res = fakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
