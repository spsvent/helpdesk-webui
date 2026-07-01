// Pure helpers for the convertHeic function, split out so the request-validation
// logic can be unit-tested without pulling in the native/WASM decoder.

// Cap the payload to bound memory/CPU on the anonymous endpoint. HEIC photos off
// a phone are typically 1-5 MB; 30 MB is a generous ceiling.
const MAX_BYTES = 30 * 1024 * 1024;

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

module.exports = { MAX_BYTES, validateInput };
