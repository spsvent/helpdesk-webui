// Helpers for HEIC → JPEG "renditions".
//
// Browsers (except Safari/iOS) can't decode HEIC, so when a converter function
// is configured the SPA generates a JPEG rendition of a HEIC attachment and
// stores it back on the ticket as a sibling attachment named "<original>.jpg"
// (e.g. "IMG_4156.HEIC.jpg"). Renditions are hidden from the attachment list and
// used purely as the preview source for their HEIC original. All logic here is
// pure so it can be unit-tested under the node vitest environment.

import type { Attachment } from "@/types/ticket";

/** True for a HEIC/HEIF file (the formats we generate renditions for). */
export function isHeic(name: string): boolean {
  return /\.hei[cf]$/i.test(name);
}

/** The rendition filename for a HEIC original ("IMG.HEIC" → "IMG.HEIC.jpg"). */
export function renditionName(heicName: string): string {
  return `${heicName}.jpg`;
}

/** True if a filename is a generated rendition (ends with ".heic.jpg"/".heif.jpg"). */
export function isRenditionName(name: string): boolean {
  return /\.hei[cf]\.jpg$/i.test(name);
}

/** The original HEIC name a rendition was derived from ("IMG.HEIC.jpg" → "IMG.HEIC"). */
export function originalOfRendition(renditionFileName: string): string {
  return renditionFileName.replace(/\.jpg$/i, "");
}

export interface RenditionView {
  /** Attachments to actually display (generated renditions removed). */
  visible: Attachment[];
  /** Map from a HEIC original's name to its rendition attachment, when one exists. */
  renditionByOriginal: Map<string, Attachment>;
}

/**
 * Split an attachment list into what to display vs. the HEIC→rendition mapping.
 *
 * A "<name>.heic.jpg" file is only treated as a generated rendition (and hidden)
 * when its HEIC original is actually present in the list. This keeps a user file
 * that happens to be named like a rendition visible, and lets an orphaned
 * rendition (original since deleted) resurface as a normal file so it can be
 * seen/downloaded/deleted rather than vanishing. Matching is case-insensitive so
 * a case difference between the stored HEIC and its rendition still resolves.
 */
export function buildRenditionView(attachments: Attachment[]): RenditionView {
  // Index HEIC originals by lowercased name for case-insensitive lookup.
  const heicByLower = new Map<string, Attachment>();
  for (const a of attachments) {
    if (isHeic(a.name)) heicByLower.set(a.name.toLowerCase(), a);
  }

  const renditionByOriginal = new Map<string, Attachment>();
  const renditionNames = new Set<string>();
  for (const a of attachments) {
    if (!isRenditionName(a.name)) continue;
    const original = heicByLower.get(originalOfRendition(a.name).toLowerCase());
    if (original) {
      // Key by the original's actual name so lookups by HEIC filename resolve.
      renditionByOriginal.set(original.name, a);
      renditionNames.add(a.name);
    }
  }

  const visible = attachments.filter((a) => !renditionNames.has(a.name));
  return { visible, renditionByOriginal };
}
