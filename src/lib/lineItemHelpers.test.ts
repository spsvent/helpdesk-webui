// Mirrors the URL-safety tests in src/modules/purchase/purchase.test.ts for the
// legacy ticket-flow copy of the helpers (removed in Part F of the module split).

import { describe, it, expect } from "vitest";
import { isSafeItemUrl, validateLineItem } from "./lineItemHelpers";

describe("validateLineItem / isSafeItemUrl (legacy ticket-flow copy)", () => {
  it("accepts http/https URLs and rejects everything else", () => {
    expect(isSafeItemUrl("https://vendor.example/item")).toBe(true);
    expect(isSafeItemUrl("http://vendor.example/item")).toBe(true);
    // eslint-disable-next-line no-script-url
    expect(isSafeItemUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeItemUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeItemUrl("vendor.example/item")).toBe(false); // unparseable (no scheme)
  });

  it("rejects an item whose URL isn't a valid http(s) link", () => {
    // eslint-disable-next-line no-script-url
    expect(validateLineItem({ url: "javascript:alert(1)", qty: 1, cost: 0 })).toMatch(/http/);
    expect(validateLineItem({ name: "Cable", url: "not a url", qty: 1, cost: 0 })).toMatch(/http/);
  });

  it("still allows an empty/absent URL when a name is present", () => {
    expect(validateLineItem({ name: "Cable", qty: 1, cost: 0 })).toBeNull();
    expect(validateLineItem({ name: "Cable", url: "  ", qty: 1, cost: 0 })).toBeNull();
    expect(validateLineItem({ url: "https://vendor.example/item", qty: 1, cost: 0 })).toBeNull();
  });
});
