import { describe, it, expect } from "vitest";
import {
  classifyAttachmentComment,
  matchAttachmentsInComment,
  isImageAttachment,
  isBrowserPreviewable,
} from "./attachmentComments";
import type { Attachment } from "@/types/ticket";

function att(name: string): Attachment {
  return { name, contentType: "application/octet-stream", size: 0, contentUrl: "" };
}

describe("classifyAttachmentComment", () => {
  it("recognizes the multi-file creation upload comment", () => {
    const info = classifyAttachmentComment(
      "[System] 3 attachment(s) uploaded during ticket creation: a.png, b.jpg, c.pdf"
    );
    expect(info).toEqual({ kind: "uploaded", count: 3, fileList: "a.png, b.jpg, c.pdf" });
  });

  it("recognizes a single-file creation upload comment", () => {
    const info = classifyAttachmentComment(
      "[System] 1 attachment(s) uploaded during ticket creation: IMG_4156.HEIC"
    );
    expect(info).toEqual({ kind: "uploaded", count: 1, fileList: "IMG_4156.HEIC" });
  });

  it("recognizes the manual single-upload comment", () => {
    const info = classifyAttachmentComment(
      "[System] Attachment uploaded: photo.png (1.2 MB) — available in the Attachments section above."
    );
    expect(info).toEqual({ kind: "uploaded", count: 1, fileList: "photo.png" });
  });

  it("recognizes the partial-failure comment and captures both numbers", () => {
    const info = classifyAttachmentComment(
      "[System] 3 of 4 attachment(s) failed to upload during ticket creation."
    );
    expect(info).toEqual({ kind: "failed", count: 3, total: 4 });
  });

  it("returns null for ordinary comments", () => {
    expect(classifyAttachmentComment("Bridge railing is broken and rotted off.")).toBeNull();
    expect(classifyAttachmentComment("📋 Assigned to Operations by System")).toBeNull();
    expect(classifyAttachmentComment("")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    const info = classifyAttachmentComment(
      "   [System] 2 attachment(s) uploaded during ticket creation: x.png, y.png  "
    );
    expect(info).toEqual({ kind: "uploaded", count: 2, fileList: "x.png, y.png" });
  });
});

describe("matchAttachmentsInComment", () => {
  const attachments = [att("IMG_4156.HEIC"), att("diagram.png"), att("notes, final.pdf")];

  it("matches filenames present in the file list, including names with commas", () => {
    const body =
      "[System] 2 attachment(s) uploaded during ticket creation: IMG_4156.HEIC, notes, final.pdf";
    const matched = matchAttachmentsInComment(body, attachments);
    expect(matched.map((a) => a.name)).toEqual(["IMG_4156.HEIC", "notes, final.pdf"]);
  });

  it("returns an empty array when no attachment names appear (e.g. all deleted)", () => {
    expect(
      matchAttachmentsInComment("[System] 1 attachment(s) uploaded during ticket creation: gone.png", attachments)
    ).toEqual([]);
  });

  it("returns an empty array when there are no attachments loaded yet", () => {
    expect(matchAttachmentsInComment("anything IMG_4156.HEIC", [])).toEqual([]);
  });

  it("returns an empty array for comments that aren't attachment uploads", () => {
    expect(matchAttachmentsInComment("Please see diagram.png attached earlier.", attachments)).toEqual([]);
  });

  it("does not match a shorter name nested inside a longer one (backup.zip vs backup.zip.old)", () => {
    const atts = [att("backup.zip"), att("backup.zip.old")];
    // Only the .old file was uploaded — the shorter name must NOT also match.
    expect(
      matchAttachmentsInComment(
        "[System] 1 attachment(s) uploaded during ticket creation: backup.zip.old",
        atts
      ).map((a) => a.name)
    ).toEqual(["backup.zip.old"]);
    // Both uploaded — both should match, in original order.
    expect(
      matchAttachmentsInComment(
        "[System] 2 attachment(s) uploaded during ticket creation: backup.zip.old, backup.zip",
        atts
      ).map((a) => a.name)
    ).toEqual(["backup.zip", "backup.zip.old"]);
  });

  it("extracts only the named file for the single-upload format, ignoring prose", () => {
    // 'available' is a real attachment, but here it only appears in the boilerplate
    // prose — it must not be attributed to this comment.
    const atts = [att("photo.png"), att("available")];
    expect(
      matchAttachmentsInComment(
        "[System] Attachment uploaded: photo.png (1.2 MB) — available in the Attachments section above.",
        atts
      ).map((a) => a.name)
    ).toEqual(["photo.png"]);
  });

  it("does not attribute filenames mentioned in prose to an upload comment", () => {
    const atts = [att("innocent.txt"), att("screenshot.png")];
    expect(
      matchAttachmentsInComment(
        "[System] Attachment uploaded: innocent.txt (2.3 KB) — available in the Attachments section above. See screenshot.png for details.",
        atts
      ).map((a) => a.name)
    ).toEqual(["innocent.txt"]);
  });
});

describe("image extension helpers", () => {
  it("treats HEIC/TIFF as images but not browser-previewable", () => {
    expect(isImageAttachment("IMG_4156.HEIC")).toBe(true);
    expect(isBrowserPreviewable("IMG_4156.HEIC")).toBe(false);
    expect(isImageAttachment("scan.TIFF")).toBe(true);
    expect(isBrowserPreviewable("scan.TIFF")).toBe(false);
  });

  it("treats common web formats as previewable images", () => {
    for (const name of ["a.png", "b.JPG", "c.jpeg", "d.gif", "e.webp", "f.avif"]) {
      expect(isImageAttachment(name)).toBe(true);
      expect(isBrowserPreviewable(name)).toBe(true);
    }
  });

  it("rejects non-images", () => {
    expect(isImageAttachment("report.pdf")).toBe(false);
    expect(isImageAttachment("data.xlsx")).toBe(false);
    expect(isImageAttachment("noextension")).toBe(false);
    expect(isBrowserPreviewable("report.pdf")).toBe(false);
  });
});
