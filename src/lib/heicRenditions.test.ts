import { describe, it, expect } from "vitest";
import {
  isHeic,
  renditionName,
  isRenditionName,
  originalOfRendition,
  buildRenditionView,
} from "./heicRenditions";
import { isImageAttachment } from "@/lib/attachmentComments";
import type { Attachment } from "@/types/ticket";

function att(name: string): Attachment {
  return { name, contentType: "application/octet-stream", size: 0, contentUrl: "" };
}

describe("heic name helpers", () => {
  it("detects HEIC/HEIF originals case-insensitively", () => {
    expect(isHeic("IMG_4156.HEIC")).toBe(true);
    expect(isHeic("photo.heif")).toBe(true);
    expect(isHeic("photo.jpg")).toBe(false);
    expect(isHeic("IMG_4156.HEIC.jpg")).toBe(false); // a rendition is not an original
  });

  it("builds and recognizes rendition names", () => {
    expect(renditionName("IMG_4156.HEIC")).toBe("IMG_4156.HEIC.jpg");
    expect(isRenditionName("IMG_4156.HEIC.jpg")).toBe(true);
    expect(isRenditionName("scan.heif.JPG")).toBe(true);
    expect(isRenditionName("regular.jpg")).toBe(false);
    expect(originalOfRendition("IMG_4156.HEIC.jpg")).toBe("IMG_4156.HEIC");
  });
});

describe("buildRenditionView", () => {
  it("hides renditions and maps them to their originals", () => {
    const atts = [att("IMG_4156.HEIC"), att("IMG_4156.HEIC.jpg"), att("diagram.png")];
    const { visible, renditionByOriginal } = buildRenditionView(atts);
    expect(visible.map((a) => a.name)).toEqual(["IMG_4156.HEIC", "diagram.png"]);
    expect(renditionByOriginal.get("IMG_4156.HEIC")?.name).toBe("IMG_4156.HEIC.jpg");
    expect(renditionByOriginal.has("diagram.png")).toBe(false);
    // A rendition never appears as its own image in the gallery.
    expect(visible.filter((a) => isImageAttachment(a.name)).map((a) => a.name)).toEqual([
      "IMG_4156.HEIC",
      "diagram.png",
    ]);
  });

  it("matches originals to renditions case-insensitively", () => {
    // HEIC stored lowercase, rendition uppercase (or vice versa).
    const atts = [att("photo.heic"), att("photo.HEIC.jpg")];
    const { visible, renditionByOriginal } = buildRenditionView(atts);
    expect(visible.map((a) => a.name)).toEqual(["photo.heic"]);
    expect(renditionByOriginal.get("photo.heic")?.name).toBe("photo.HEIC.jpg");
  });

  it("keeps a user file named like a rendition when there is no HEIC original", () => {
    // No "IMG.HEIC" present, so "IMG.HEIC.jpg" is a real user file — must stay visible.
    const atts = [att("IMG.HEIC.jpg"), att("keep.png")];
    const { visible, renditionByOriginal } = buildRenditionView(atts);
    expect(visible.map((a) => a.name)).toEqual(["IMG.HEIC.jpg", "keep.png"]);
    expect(renditionByOriginal.size).toBe(0);
  });

  it("resurfaces an orphaned rendition (original deleted) as a normal file", () => {
    const atts = [att("gone.HEIC.jpg"), att("keep.png")];
    const { visible, renditionByOriginal } = buildRenditionView(atts);
    expect(visible.map((a) => a.name)).toEqual(["gone.HEIC.jpg", "keep.png"]);
    expect(renditionByOriginal.size).toBe(0);
  });

  it("leaves lists without renditions untouched", () => {
    const atts = [att("a.png"), att("b.HEIC")];
    const { visible, renditionByOriginal } = buildRenditionView(atts);
    expect(visible.map((a) => a.name)).toEqual(["a.png", "b.HEIC"]);
    expect(renditionByOriginal.size).toBe(0);
  });
});
