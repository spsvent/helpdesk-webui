// Client wrapper for the stateless HEIC → JPEG converter Azure Function.
//
// The SPA sends the raw HEIC bytes and gets JPEG bytes back; the caller is
// responsible for storing/displaying the result. Gated on the function URL so
// the app degrades gracefully (HEIC shows a download fallback) when it isn't
// configured — e.g. before the function is deployed.

const HEIC_CONVERT_URL = process.env.NEXT_PUBLIC_HEIC_CONVERT_URL || "";

/** Whether backend HEIC conversion is configured. */
export function isHeicConvertEnabled(): boolean {
  return Boolean(HEIC_CONVERT_URL);
}

/**
 * Convert a HEIC blob to a JPEG blob via the converter function.
 * Returns null if conversion is not configured or fails (caller falls back to a
 * download-only experience).
 */
export async function convertHeicToJpeg(heic: Blob): Promise<Blob | null> {
  if (!HEIC_CONVERT_URL) return null;
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
