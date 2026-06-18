import { describe, it, expect } from "vitest";
import { saveDraft, loadDraft, clearDraft } from "./formDraft";

function mockStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("formDraft", () => {
  it("round-trips a draft", () => {
    const s = mockStore();
    saveDraft("new-ticket", { title: "x", lineItems: [{ qty: 2 }] }, s);
    expect(loadDraft("new-ticket", s)).toEqual({ title: "x", lineItems: [{ qty: 2 }] });
  });
  it("returns null for a missing draft", () => {
    expect(loadDraft("nope", mockStore())).toBeNull();
  });
  it("returns null for corrupt JSON instead of throwing", () => {
    const s = mockStore();
    s.setItem("helpdesk-draft:bad", "{not json");
    expect(loadDraft("bad", s)).toBeNull();
  });
  it("clears a draft", () => {
    const s = mockStore();
    saveDraft("k", { a: 1 }, s);
    clearDraft("k", s);
    expect(loadDraft("k", s)).toBeNull();
  });
  it("no-ops safely when storage is null (SSR)", () => {
    expect(() => saveDraft("k", { a: 1 }, null)).not.toThrow();
    expect(loadDraft("k", null)).toBeNull();
  });
});
