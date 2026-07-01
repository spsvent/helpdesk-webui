// Helpers for recognizing and enriching the "[System]" attachment comments that
// the ticket-creation flow and the manual upload handler post to the thread.
//
// These comments are stored as plain text (see src/app/new/page.tsx and
// TicketDetail.handleUploadAttachment). The conversation view detects them here
// so it can render clickable thumbnails + filename links instead of a raw
// "[System] 1 attachment(s) uploaded..." line. All logic in this module is pure
// so it can be unit-tested under the node vitest environment.

import type { Attachment } from "@/types/ticket";

// Extensions we treat as images — i.e. candidates for the lightbox gallery.
const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif",
  "heic", "heif", "tif", "tiff",
];

// The subset a browser can actually decode in an <img> tag. HEIC/HEIF (iPhone)
// and TIFF (scanners) are common on tickets but won't render — we still count
// them as images so they appear in the gallery, but the UI shows a download
// fallback instead of a broken thumbnail.
const BROWSER_PREVIEWABLE_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif",
];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** True for any file we consider an image (including HEIC/TIFF). */
export function isImageAttachment(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

/** True only for formats a browser can render directly in an <img>. */
export function isBrowserPreviewable(name: string): boolean {
  return BROWSER_PREVIEWABLE_EXTENSIONS.includes(extensionOf(name));
}

export type AttachmentCommentKind = "uploaded" | "failed";

export interface AttachmentCommentInfo {
  kind: AttachmentCommentKind;
  /** For "uploaded": how many files the message reports. For "failed": how many failed. */
  count: number;
  /** For "failed" only: the total staged count (the "N" in "M of N failed"). */
  total?: number;
  /**
   * For "uploaded" only: the portion of the message that actually names the
   * files (the comma-joined list, or the single filename). Filename matching is
   * confined to this so names mentioned in prose elsewhere can't false-match.
   */
  fileList?: string;
}

// "[System] 3 attachment(s) uploaded during ticket creation: a.png, b.png"
// Group 2 captures the file list (everything after the colon).
const UPLOAD_CREATION_RE =
  /^\[System\]\s+(\d+)\s+attachment\(s\)\s+uploaded during ticket creation:\s*(.*)$/i;
// "[System] Attachment uploaded: name (12.3 KB) — available in the Attachments section above."
// Group 1 captures the filename, stopping before the size "(" or the " —" trailer.
const UPLOAD_SINGLE_RE = /^\[System\]\s+Attachment uploaded:\s+(.+?)(?:\s+\(|\s+—|$)/i;
// "[System] 3 of 4 attachment(s) failed to upload during ticket creation."
const UPLOAD_FAILED_RE =
  /^\[System\]\s+(\d+)\s+of\s+(\d+)\s+attachment\(s\)\s+failed to upload/i;

/**
 * Classify a comment body as one of the recognized "[System]" attachment
 * comments, or return null if it isn't one (so it renders normally).
 */
export function classifyAttachmentComment(
  body: string
): AttachmentCommentInfo | null {
  if (!body) return null;
  const trimmed = body.trim();

  const failed = trimmed.match(UPLOAD_FAILED_RE);
  if (failed) {
    return {
      kind: "failed",
      count: parseInt(failed[1], 10),
      total: parseInt(failed[2], 10),
    };
  }

  const created = trimmed.match(UPLOAD_CREATION_RE);
  if (created) {
    return { kind: "uploaded", count: parseInt(created[1], 10), fileList: created[2].trim() };
  }

  const single = trimmed.match(UPLOAD_SINGLE_RE);
  if (single) {
    return { kind: "uploaded", count: 1, fileList: single[1].trim() };
  }

  return null;
}

/**
 * Given an upload comment body and the ticket's current attachments, return the
 * attachments the comment refers to.
 *
 * Matching is confined to the file-list portion of the message (see
 * `AttachmentCommentInfo.fileList`) so filenames mentioned in prose can't
 * false-match. Names are matched longest-first and each match consumes its span,
 * so a short name ("backup.zip") can't also match inside a longer one
 * ("backup.zip.old"). Substring matching (rather than splitting on ", ") keeps
 * filenames that themselves contain commas intact. Attachments deleted since the
 * comment was posted simply won't match.
 */
export function matchAttachmentsInComment(
  body: string,
  attachments: Attachment[]
): Attachment[] {
  if (!body || attachments.length === 0) return [];
  const info = classifyAttachmentComment(body);
  if (!info || info.kind !== "uploaded" || !info.fileList) return [];

  let remaining = info.fileList;
  const matchedNames = new Set<string>();
  // Longest names first so consuming their span prevents nested false matches.
  const byLengthDesc = [...attachments].sort((a, b) => b.name.length - a.name.length);
  for (const a of byLengthDesc) {
    if (a.name && remaining.includes(a.name)) {
      matchedNames.add(a.name);
      remaining = remaining.replace(a.name, " "); // literal replace of first occurrence
    }
  }
  // Preserve the ticket's original attachment ordering.
  return attachments.filter((a) => matchedNames.has(a.name));
}
