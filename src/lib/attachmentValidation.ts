// Client-side gate for ticket attachments.
//
// Pure so it can be unit-tested under the node vitest environment, and shared
// by the upload component's `accept` list and its size check. Nothing here
// rejects by file type — SharePoint stores whatever bytes we send (see
// `uploadAttachment` in graphClient) — so the accept list is a picker
// convenience, not a security boundary.

/**
 * File types offered in the file picker.
 *
 * HEIC/HEIF are listed explicitly because Windows and Android frequently report
 * no MIME type for them, so "image/*" alone greys iPhone photos out even though
 * the upload path handles them fine.
 */
export const DEFAULT_ACCEPTED_TYPES = [
  "image/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  ".log",
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".heic",
  ".heif",
];

/**
 * Default per-file cap, in MB. Matches MAX_HEIC_CONVERT_BYTES in
 * heicConvertService so anything that uploads can also be previewed.
 */
export const DEFAULT_MAX_SIZE_MB = 15;

/** Human-readable file size ("1.4 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Whether a file looks like a photo, by MIME type or extension. Extension is
 * the fallback because HEICs often arrive with an empty `type`.
 */
export function isPhotoFile(name: string, type: string): boolean {
  return /^image\//.test(type) || /\.(hei[cf]|jpe?g|png|gif)$/i.test(name);
}

/** The size/emptiness error for a file, or null when it's acceptable. */
export function validateAttachment(
  file: { name: string; type: string; size: number },
  maxSizeMB: number = DEFAULT_MAX_SIZE_MB
): string | null {
  if (file.size > maxSizeMB * 1024 * 1024) {
    return isPhotoFile(file.name, file.type)
      ? `Photo too large (${formatFileSize(file.size)}). Maximum size is ${maxSizeMB}MB — ` +
          `try emailing it to the help desk, or resize it before uploading.`
      : `File too large. Maximum size is ${maxSizeMB}MB.`;
  }
  if (file.size === 0) {
    return "Cannot upload empty files.";
  }
  return null;
}
