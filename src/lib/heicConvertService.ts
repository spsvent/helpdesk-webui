// Client wrapper for the stateless HEIC → JPEG converter Azure Function.
//
// The SPA sends the raw HEIC bytes and gets JPEG bytes back; the caller is
// responsible for storing/displaying the result. Gated on the function URL so
// the app degrades gracefully (HEIC shows a download fallback) when it isn't
// configured — e.g. before the function is deployed.
//
// The function requires a key (authLevel "function"), carried in the URL as
// ?code=<function-key> — same pattern as the SendEmail/Teams/Escalation URLs.

const HEIC_CONVERT_URL = process.env.NEXT_PUBLIC_HEIC_CONVERT_URL || "";

// The converter rejects bodies over this size (mirror of MAX_BYTES in
// azure-functions/src/lib/heicConvert.js — keep the two in sync). Enforced
// client-side too so oversized files skip the round trip and fall straight
// back to the download-only experience.
export const MAX_HEIC_CONVERT_BYTES = 15 * 1024 * 1024;

/** Whether backend HEIC conversion is configured. */
export function isHeicConvertEnabled(): boolean {
  return Boolean(HEIC_CONVERT_URL);
}

/**
 * Whether a file of this size is worth sending to the converter. Unknown sizes
 * pass (the converter's own cap is the backstop).
 */
export function isConvertibleSize(bytes: number | undefined): boolean {
  return bytes === undefined || bytes <= MAX_HEIC_CONVERT_BYTES;
}

/**
 * Convert a HEIC blob to a JPEG blob via the converter function.
 * Returns null if conversion is not configured, the file is over the size cap,
 * or the call fails (caller falls back to a download-only experience).
 */
export async function convertHeicToJpeg(heic: Blob): Promise<Blob | null> {
  if (!HEIC_CONVERT_URL) return null;
  if (!isConvertibleSize(heic.size)) {
    console.warn("[convertHeicToJpeg] file exceeds the converter size cap, skipping");
    return null;
  }
  try {
    const res = await fetch(HEIC_CONVERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: heic,
    });
    if (!res.ok) {
      console.error("[convertHeicToJpeg] converter returned", res.status);
      return null;
    }
    const jpeg = await res.blob();
    return jpeg.size > 0 ? jpeg : null;
  } catch (e) {
    console.error("[convertHeicToJpeg] request failed:", e);
    return null;
  }
}
