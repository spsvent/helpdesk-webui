const { test } = require("node:test");
const assert = require("node:assert");
const { isValidItemId, isWithinCooldown, RESEND_COOLDOWN_MS } = require("../src/lib/requestGuards");

test("isValidItemId accepts plain decimal integers", () => {
  assert.strictEqual(isValidItemId("42"), true);
  assert.strictEqual(isValidItemId(42), true);
  assert.strictEqual(isValidItemId("0"), true);
  assert.strictEqual(isValidItemId("1234567890"), true);
});

test("isValidItemId rejects anything that isn't a small decimal integer", () => {
  assert.strictEqual(isValidItemId(undefined), false);
  assert.strictEqual(isValidItemId(null), false);
  assert.strictEqual(isValidItemId(""), false);
  assert.strictEqual(isValidItemId("12.5"), false);
  assert.strictEqual(isValidItemId("-3"), false);
  assert.strictEqual(isValidItemId("1e9"), false);
  assert.strictEqual(isValidItemId("12abc"), false);
  assert.strictEqual(isValidItemId("12/../etc"), false);
  assert.strictEqual(isValidItemId("12?$select=secret"), false);
  assert.strictEqual(isValidItemId("12345678901"), false); // > 10 digits
  assert.strictEqual(isValidItemId({}), false);
});

test("isWithinCooldown is inactive with no or invalid stamp", () => {
  assert.strictEqual(isWithinCooldown(undefined), false);
  assert.strictEqual(isWithinCooldown(null), false);
  assert.strictEqual(isWithinCooldown(""), false);
  assert.strictEqual(isWithinCooldown("not-a-date"), false);
});

test("isWithinCooldown is active inside the window", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  assert.strictEqual(isWithinCooldown("2026-07-01T11:59:00Z", now), true); // 1 min ago
  assert.strictEqual(isWithinCooldown("2026-07-01T11:50:01Z", now), true); // just inside 10 min
});

test("isWithinCooldown expires at the window boundary", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  assert.strictEqual(isWithinCooldown("2026-07-01T11:50:00Z", now), false); // exactly 10 min ago
  assert.strictEqual(isWithinCooldown("2026-07-01T09:00:00Z", now), false); // long past
});

test("isWithinCooldown treats a (server-written) future stamp as active", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  assert.strictEqual(isWithinCooldown("2026-07-01T12:00:30Z", now), true);
});

test("isWithinCooldown honors a custom window", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  assert.strictEqual(isWithinCooldown("2026-07-01T11:59:30Z", now, 60 * 1000), true);
  assert.strictEqual(isWithinCooldown("2026-07-01T11:58:00Z", now, 60 * 1000), false);
});

test("default cooldown window is 10 minutes", () => {
  assert.strictEqual(RESEND_COOLDOWN_MS, 10 * 60 * 1000);
});
