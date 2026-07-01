const { app } = require("@azure/functions");
const convert = require("heic-convert");
const { validateInput } = require("../lib/heicConvert");

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
// the returned JPEG as a sibling attachment using the caller's own token, so an
// anonymous endpoint can only ever convert bytes it was handed (no tenant data),
// which — plus the size cap — is why "anonymous" is acceptable here (matching the
// other functions' anonymous + self-limiting pattern).
app.http("convertHeic", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
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

    try {
      const output = await convert({ buffer: input, format: "JPEG", quality: 0.85 });
      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "image/jpeg" },
        body: Buffer.from(output),
      };
    } catch (error) {
      context.error("convertHeic failed:", error);
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { ok: false, reason: "convert_failed", details: error.message },
      };
    }
  },
});
