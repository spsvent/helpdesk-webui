const { test } = require("node:test");
const assert = require("node:assert");
const { validateInput, MAX_BYTES } = require("../src/lib/heicConvert");

test("rejects an empty or missing body", () => {
  assert.strictEqual(validateInput(null), "empty_body");
  assert.strictEqual(validateInput(Buffer.alloc(0)), "empty_body");
});

test("rejects a body over the size cap", () => {
  const tooBig = { length: MAX_BYTES + 1 };
  assert.strictEqual(validateInput(tooBig), "too_large");
});

test("accepts a normal-sized body", () => {
  assert.strictEqual(validateInput(Buffer.alloc(1024)), null);
  assert.strictEqual(validateInput({ length: MAX_BYTES }), null);
});
