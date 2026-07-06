import { describe, it, expect, vi, afterEach } from "vitest";
import {
  convertHeicToJpeg,
  isConvertibleSize,
  HEIC_CONVERT_TIMEOUT_MS,
  MAX_HEIC_CONVERT_BYTES,
} from "./heicConvertService";

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

describe("convertHeicToJpeg", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns null without fetching when the converter URL isn't configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(convertHeicToJpeg(new Blob(["x"]))).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sends the request with a timeout signal so a hung converter can't spin forever", async () => {
    vi.stubEnv("NEXT_PUBLIC_HEIC_CONVERT_URL", "https://example.test/convert?code=k");
    vi.resetModules();
    const mod = await import("./heicConvertService");

    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(new Blob(["jpeg-bytes"]))
    );
    vi.stubGlobal("fetch", fetchMock);

    const jpeg = await mod.convertHeicToJpeg(new Blob(["heic-bytes"]));
    expect(jpeg).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a ~30s timeout window", () => {
    expect(HEIC_CONVERT_TIMEOUT_MS).toBe(30_000);
  });
});
