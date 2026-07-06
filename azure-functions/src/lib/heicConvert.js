// Pure helpers for the convertHeic function, split out so the request-validation
// logic can be unit-tested without pulling in the native/WASM decoder.

// Cap the payload to bound memory/CPU. HEIC photos off a phone are typically
// 1-5 MB; 15 MB is still a generous ceiling. Keep in sync with
// MAX_HEIC_CONVERT_BYTES in the SPA's src/lib/heicConvertService.ts, which
// enforces the same cap client-side to skip the round trip.
const MAX_BYTES = 15 * 1024 * 1024;

// ISO-BMFF brands that identify HEIC/HEIF content (Nokia/Apple encoders use
// "heic"/"heix"/"mif1" as the major brand; "hevc"/"msf1" cover sequences).
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/**
 * Validate the raw request body for the converter.
 * @param {Buffer|Uint8Array|null} buffer
 * @returns {null | "empty_body" | "too_large"} error code, or null if OK
 */
function validateInput(buffer) {
  if (!buffer || buffer.length === 0) return "empty_body";
  if (buffer.length > MAX_BYTES) return "too_large";
  return null;
}

/**
 * Cheap magic-byte sniff: is this plausibly a HEIC/HEIF file? Checks the leading
 * ISO-BMFF "ftyp" box for a HEIC major brand (or one in the compatible-brands
 * list) before we hand the bytes to the comparatively expensive WASM decoder.
 * @param {Buffer|Uint8Array|null} buffer
 * @returns {boolean}
 */
function isHeicBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // Layout: [4-byte box size]["ftyp"][4-byte major brand][4-byte minor version][compatible brands...]
  if (buffer[4] !== 0x66 || buffer[5] !== 0x74 || buffer[6] !== 0x79 || buffer[7] !== 0x70) return false; // "ftyp"
  const brandAt = (i) => String.fromCharCode(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
  if (HEIC_BRANDS.has(brandAt(8))) return true;
  // Generic major brand (e.g. "isom"): scan the compatible-brands list, bounded
  // by the ftyp box size (unsigned 32-bit big-endian, clamped to the buffer).
  const boxSize = buffer[0] * 0x1000000 + buffer[1] * 0x10000 + buffer[2] * 0x100 + buffer[3];
  const end = Math.min(boxSize, buffer.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    if (HEIC_BRANDS.has(brandAt(i))) return true;
  }
  return false;
}

module.exports = { MAX_BYTES, validateInput, isHeicBuffer };
