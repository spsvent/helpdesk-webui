import {
  AccountInfo,
  IPublicClientApplication,
  InteractionRequiredAuthError,
  BrowserAuthError,
} from "@azure/msal-browser";
import { isRunningInTeams, openTeamsAuthPopup } from "./teamsAuth";
import type { SessionLike } from "./formDraft";

export const RENEWAL_KEY = "helpdesk-token-renewal-attempted";

function store(): SessionLike | null {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : null;
}

// True for MSAL's "another interaction is already in progress" / iframe-redirect errors.
export function isInteractionInProgressError(e: unknown): boolean {
  const code =
    e instanceof BrowserAuthError ? e.errorCode : (e as { errorCode?: string } | null)?.errorCode;
  return code === "interaction_in_progress" || code === "redirect_in_iframe";
}

export function renewalRedirectAllowed(s: SessionLike | null = store()): boolean {
  return !s || !s.getItem(RENEWAL_KEY);
}
export function markRenewalAttempt(state: string, s: SessionLike | null = store()): void {
  s?.setItem(RENEWAL_KEY, state);
}
// Clear ONLY when the returned redirect state matches our stored attempt — so a login
// redirect's return cannot disarm the renewal guard.
export function clearRenewalAttemptIfMatches(
  returnedState: string | undefined | null,
  s: SessionLike | null = store(),
): void {
  if (returnedState && s && s.getItem(RENEWAL_KEY) === returnedState) s.removeItem(RENEWAL_KEY);
}

// ---- authReady: resolved by layout once its initial handleRedirectPromise settles ----
let _resolveAuthReady: () => void = () => {};
export const authReady: Promise<void> = new Promise((res) => {
  _resolveAuthReady = res;
});
export function markAuthReady(): void {
  _resolveAuthReady();
}

// ssoSilent capped by a timeout so a hung hidden iframe can't block renewal.
export async function ssoSilentWithTimeout(
  instance: IPublicClientApplication,
  account: AccountInfo,
  request: { scopes: string[] },
  ms = 5000,
): Promise<string> {
  const sso = instance.ssoSilent({ ...request, loginHint: account.username, account });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("ssoSilent timeout")), ms));
  const res = await Promise.race([sso, timeout]);
  return res.accessToken;
}

// Start a loop-guarded, draft-snapshotting renewal redirect (browser). Page unloads,
// so this never resolves on success; returns false only when it declines to redirect.
async function startRenewalRedirect(
  instance: IPublicClientApplication,
  account: AccountInfo,
  request: { scopes: string[] },
  onBeforeRedirect?: () => void,
): Promise<boolean> {
  await authReady; // don't redirect while layout's initial handleRedirectPromise is mid-flight
  if (!renewalRedirectAllowed()) return false; // already bounced & still failing -> caller shows "Sign in"
  onBeforeRedirect?.();
  const state = `renewal:${account.homeAccountId}:${Date.now()}`;
  markRenewalAttempt(state);
  try {
    await instance.acquireTokenRedirect({ ...request, account, state });
  } catch (e) {
    if (isInteractionInProgressError(e)) return false; // an interaction is already running
    throw e;
  }
  return false;
}

// Pre-flight gate for WRITE handlers. Returns true if a fresh token is available and the
// action may proceed. In the browser, if interactive is required it snapshots via
// onBeforeRedirect then redirects (page unloads -> resolves false / never returns).
export async function ensureFreshToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
  request: { scopes: string[] },
  opts: { isTeams?: boolean; onBeforeRedirect?: () => void } = {},
): Promise<boolean> {
  try {
    await instance.acquireTokenSilent({ ...request, account });
    return true;
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) return true; // transient — let the real call surface it
  }
  if (opts.isTeams ?? isRunningInTeams()) {
    return (await openTeamsAuthPopup()) !== null;
  }
  try {
    await ssoSilentWithTimeout(instance, account, request);
    return true;
  } catch {
    /* fall through to redirect */
  }
  return startRenewalRedirect(instance, account, request, opts.onBeforeRedirect);
}
