const { test } = require("node:test");
const assert = require("node:assert");
const { validateInput, isHeicBuffer, MAX_BYTES } = require("../src/lib/heicConvert");

// Build a minimal ISO-BMFF ftyp header: [size]["ftyp"][major][minor][compat...]
function ftyp(major, compat = []) {
  const brands = [major, "\0\0\0\0", ...compat]; // minor version as 4 zero bytes
  const size = 8 + brands.length * 4;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write("ftyp", 4, "ascii");
  brands.forEach((b, i) => buf.write(b, 8 + i * 4, "ascii"));
  return buf;
}

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

test("size cap is 15 MB", () => {
  assert.strictEqual(MAX_BYTES, 15 * 1024 * 1024);
});

test("isHeicBuffer accepts HEIC major brands", () => {
  for (const brand of ["heic", "heix", "hevc", "mif1", "msf1"]) {
    assert.strictEqual(isHeicBuffer(ftyp(brand)), true, brand);
  }
});

test("isHeicBuffer accepts a generic major brand with heic in compatible brands", () => {
  assert.strictEqual(isHeicBuffer(ftyp("isom", ["avc1", "heic"])), true);
  assert.strictEqual(isHeicBuffer(ftyp("mp42", ["mif1"])), true);
});

test("isHeicBuffer rejects non-HEIC ISO-BMFF (e.g. MP4)", () => {
  assert.strictEqual(isHeicBuffer(ftyp("isom", ["avc1", "mp41"])), false);
  assert.strictEqual(isHeicBuffer(ftyp("qt  ")), false);
});

test("isHeicBuffer rejects non-BMFF bytes and short buffers", () => {
  assert.strictEqual(isHeicBuffer(null), false);
  assert.strictEqual(isHeicBuffer(Buffer.alloc(0)), false);
  assert.strictEqual(isHeicBuffer(Buffer.alloc(8)), false);
  assert.strictEqual(isHeicBuffer(Buffer.from("\x89PNG\r\n\x1a\n" + "0".repeat(16), "latin1")), false);
  assert.strictEqual(isHeicBuffer(Buffer.from("\xff\xd8\xff\xe0" + "JFIF".repeat(4), "latin1")), false); // JPEG
});

test("isHeicBuffer clamps the compatible-brand scan to the buffer", () => {
  // Claims a huge ftyp box but the buffer is short — must not throw or match.
  const buf = ftyp("isom", ["avc1"]);
  buf.writeUInt32BE(0xffffffff, 0);
  assert.strictEqual(isHeicBuffer(buf), false);
});
