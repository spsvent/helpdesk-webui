import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_SIZE_MB,
  formatFileSize,
  isPhotoFile,
  validateAttachment,
} from "./attachmentValidation";
import { MAX_HEIC_CONVERT_BYTES } from "./heicConvertService";

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => ({ name, type, size });

describe("DEFAULT_ACCEPTED_TYPES", () => {
  // The original bug: iPhone photos were filtered out of the file picker
  // because only "image/*" covered them, and HEIC often has no MIME type.
  it("lists heic/heif explicitly, not just image/*", () => {
    expect(DEFAULT_ACCEPTED_TYPES).toContain(".heic");
    expect(DEFAULT_ACCEPTED_TYPES).toContain(".heif");
  });

  it("still accepts the previously-supported formats", () => {
    for (const t of [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".docx", ".xlsx", ".txt", ".log"]) {
      expect(DEFAULT_ACCEPTED_TYPES).toContain(t);
    }
  });
});

describe("DEFAULT_MAX_SIZE_MB", () => {
  // A file that uploads must also be small enough to preview, or HEICs land
  // in the list with no rendition and no explanation.
  it("matches the HEIC converter's cap", () => {
    expect(DEFAULT_MAX_SIZE_MB * MB).toBe(MAX_HEIC_CONVERT_BYTES);
  });
});

describe("isPhotoFile", () => {
  it("detects HEIC by extension when the MIME type is empty", () => {
    expect(isPhotoFile("IMG_0001.HEIC", "")).toBe(true);
    expect(isPhotoFile("IMG_0001.heif", "")).toBe(true);
  });

  it("detects images by MIME type", () => {
    expect(isPhotoFile("photo", "image/jpeg")).toBe(true);
  });

  it("does not treat documents as photos", () => {
    expect(isPhotoFile("report.pdf", "application/pdf")).toBe(false);
    expect(isPhotoFile("notes.txt", "text/plain")).toBe(false);
  });
});

describe("validateAttachment", () => {
  it("accepts a typical iPhone HEIC with no MIME type", () => {
    expect(validateAttachment(file("IMG_0001.HEIC", "", 4 * MB))).toBeNull();
  });

  it("accepts a file at exactly the cap", () => {
    expect(validateAttachment(file("IMG_0001.HEIC", "", DEFAULT_MAX_SIZE_MB * MB))).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateAttachment(file("empty.txt", "text/plain", 0))).toBe(
      "Cannot upload empty files."
    );
  });

  it("gives oversized photos an actionable message", () => {
    const err = validateAttachment(file("IMG_0001.HEIC", "", 20 * MB));
    expect(err).toContain("Photo too large");
    expect(err).toContain("20 MB");
    expect(err).toContain("emailing it to the help desk");
  });

  it("keeps the plain message for oversized non-photos", () => {
    expect(validateAttachment(file("dump.log", "text/plain", 20 * MB))).toBe(
      `File too large. Maximum size is ${DEFAULT_MAX_SIZE_MB}MB.`
    );
  });

  it("honors a custom cap", () => {
    expect(validateAttachment(file("a.png", "image/png", 3 * MB), 2)).toContain("Photo too large");
    expect(validateAttachment(file("a.png", "image/png", 1 * MB), 2)).toBeNull();
  });
});

describe("formatFileSize", () => {
  it("formats sizes across units", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(20 * MB)).toBe("20 MB");
  });
});
