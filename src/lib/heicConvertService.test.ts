import { describe, it, expect } from "vitest";
import { isConvertibleSize, MAX_HEIC_CONVERT_BYTES } from "./heicConvertService";

describe("isConvertibleSize", () => {
  it("accepts sizes up to the converter cap", () => {
    expect(isConvertibleSize(0)).toBe(true);
    expect(isConvertibleSize(3 * 1024 * 1024)).toBe(true); // typical phone HEIC
    expect(isConvertibleSize(MAX_HEIC_CONVERT_BYTES)).toBe(true);
  });

  it("rejects sizes over the converter cap", () => {
    expect(isConvertibleSize(MAX_HEIC_CONVERT_BYTES + 1)).toBe(false);
    expect(isConvertibleSize(30 * 1024 * 1024)).toBe(false);
  });

  it("passes unknown sizes through (server cap is the backstop)", () => {
    expect(isConvertibleSize(undefined)).toBe(true);
  });

  it("mirrors the Azure Function's 15 MB cap", () => {
    expect(MAX_HEIC_CONVERT_BYTES).toBe(15 * 1024 * 1024);
  });
});
