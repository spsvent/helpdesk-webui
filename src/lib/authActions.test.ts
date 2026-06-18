import { describe, it, expect } from "vitest";
import { BrowserAuthError } from "@azure/msal-browser";
import {
  isInteractionInProgressError,
  renewalRedirectAllowed,
  markRenewalAttempt,
  clearRenewalAttempt,
  RENEWAL_KEY,
} from "./authActions";

function mockStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("isInteractionInProgressError", () => {
  it("recognizes interaction_in_progress and redirect_in_iframe", () => {
    expect(isInteractionInProgressError(new BrowserAuthError("interaction_in_progress"))).toBe(true);
    expect(isInteractionInProgressError(new BrowserAuthError("redirect_in_iframe"))).toBe(true);
    expect(isInteractionInProgressError({ errorCode: "interaction_in_progress" })).toBe(true);
  });
  it("rejects other errors", () => {
    expect(isInteractionInProgressError(new BrowserAuthError("no_account_error"))).toBe(false);
    expect(isInteractionInProgressError(new Error("boom"))).toBe(false);
    expect(isInteractionInProgressError(null)).toBe(false);
  });
});

describe("renewal loop guard", () => {
  it("allows when no attempt is marked, blocks within the TTL window", () => {
    const s = mockStore();
    expect(renewalRedirectAllowed(s, 1000)).toBe(true);
    markRenewalAttempt("renewal:uid.utid:1000", s);
    expect(renewalRedirectAllowed(s, 1000)).toBe(false);
  });
  it("self-heals a stale marker past the TTL", () => {
    const s = mockStore();
    markRenewalAttempt("renewal:uid.utid:1000", s);
    expect(renewalRedirectAllowed(s, 1000 + 91_000)).toBe(true); // stale -> allowed + cleared
    expect(s.getItem(RENEWAL_KEY)).toBeNull();
  });
  it("clearRenewalAttempt re-arms unconditionally", () => {
    const s = mockStore();
    markRenewalAttempt("renewal:uid.utid:1000", s);
    clearRenewalAttempt(s);
    expect(renewalRedirectAllowed(s, 1000)).toBe(true);
  });
  it("stores under RENEWAL_KEY distinct from the login marker", () => {
    expect(RENEWAL_KEY).toBe("helpdesk-token-renewal-attempted");
  });
});
