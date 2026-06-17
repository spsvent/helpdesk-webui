const { test } = require("node:test");
const assert = require("node:assert");

// Force a known secret BEFORE requiring the module
process.env.APPROVAL_LINK_SECRET = "test-secret-please-ignore";
const { signToken, verifyToken } = require("../src/lib/approvalToken");

const basePayload = { tid: "42", action: "approve", email: "gm@x.com", name: "GM" };

test("round-trips a valid token", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const result = verifyToken(token, { now: 1050 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.payload.tid, "42");
  assert.strictEqual(result.payload.action, "approve");
  assert.strictEqual(result.payload.email, "gm@x.com");
});

test("rejects an expired token", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const result = verifyToken(token, { now: 2000 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "expired");
});

test("rejects a tampered payload", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...basePayload, action: "approve", tid: "999" })).toString("base64url");
  const result = verifyToken(`${forged}.${sig}`, { now: 1050 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "bad_signature");
});

test("rejects a malformed token", () => {
  assert.strictEqual(verifyToken("garbage", { now: 1 }).valid, false);
  assert.strictEqual(verifyToken("a.b.c", { now: 1 }).valid, false);
});
