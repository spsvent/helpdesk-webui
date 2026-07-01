const { app } = require("@azure/functions");
const convert = require("heic-convert");
const { validateInput, isHeicBuffer } = require("../lib/heicConvert");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Stateless HEIC -> JPEG converter.
//
// The browser can't decode HEIC on Chrome/Firefox, and the SPA is a static
// export with no server, so it POSTs the raw HEIC bytes here and gets JPEG bytes
// back. This function has NO SharePoint/Graph access on purpose — the SPA stores
// the returned JPEG as a sibling attachment using the caller's own token, so the
// endpoint never touches tenant data.
//
// authLevel "function": conversion is CPU/memory-heavy (WASM decode of up to
// MAX_BYTES), so require the SPA's function key (carried in
// NEXT_PUBLIC_HEIC_CONVERT_URL as ?code=, same as the SendEmail/Teams/Escalation
// URLs) rather than running a free public conversion service. The size cap and
// the HEIC magic-byte sniff below bound what even a keyed caller can make it do.
app.http("convertHeic", {
  methods: ["POST", "OPTIONS"],
  authLevel: "function",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    let input;
    try {
      input = Buffer.from(await request.arrayBuffer());
    } catch {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "unreadable_body" } };
    }

    const invalid = validateInput(input);
    if (invalid) {
      const status = invalid === "too_large" ? 413 : 400;
      return { status, headers: corsHeaders, jsonBody: { ok: false, reason: invalid } };
    }

    // Cheap magic-byte sniff before invoking the WASM decoder on arbitrary bytes.
    if (!isHeicBuffer(input)) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "not_heic" } };
    }

    try {
      const output = await convert({ buffer: input, format: "JPEG", quality: 0.85 });
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "image/jpeg" },
        body: Buffer.from(output),
      };
    } catch (error) {
      // Log the detail server-side only — error.message can leak decoder internals.
      context.error("convertHeic failed:", error);
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { ok: false, reason: "convert_failed" },
      };
    }
  },
});
