import { describe, it, expect } from "vitest";
import { BrowserAuthError } from "@azure/msal-browser";
import {
  isInteractionInProgressError,
  renewalRedirectAllowed,
  markRenewalAttempt,
  clearRenewalAttemptIfMatches,
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
  it("allows a redirect when no attempt is marked, blocks after", () => {
    const s = mockStore();
    expect(renewalRedirectAllowed(s)).toBe(true);
    markRenewalAttempt("renewal:abc", s);
    expect(renewalRedirectAllowed(s)).toBe(false);
  });
  it("clears only when the returned state matches the stored attempt", () => {
    const s = mockStore();
    markRenewalAttempt("renewal:abc", s);
    clearRenewalAttemptIfMatches("login:other", s); // non-matching (e.g. a login return)
    expect(renewalRedirectAllowed(s)).toBe(false);
    clearRenewalAttemptIfMatches("renewal:abc", s); // matching
    expect(renewalRedirectAllowed(s)).toBe(true);
  });
  it("stores under RENEWAL_KEY distinct from the login marker", () => {
    expect(RENEWAL_KEY).toBe("helpdesk-token-renewal-attempted");
  });
});
