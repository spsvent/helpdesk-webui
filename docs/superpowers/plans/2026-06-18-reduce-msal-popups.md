# Reduce MSAL Browser Popups (Piece D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eliminate the two browser `acquireTokenPopup` (token-renewal) calls without losing unsaved work — redirects fire at safe moments (pre-flight, after a draft snapshot), never mid-action; Teams unchanged.

**Architecture:** A pre-flight `ensureFreshToken()` gate at the top of every write handler (refreshes silently → `ssoSilent` w/ 5s timeout → redirect, snapshotting a draft first). The lazy per-call renewal in `graphClient` becomes a read-only safety net using the same primitives. An `authReady` gate + catching the thrown `interaction_in_progress` replaces the unreachable `inProgress` check. A loop guard keyed by `response.state` prevents redirect storms. Spec: `docs/superpowers/specs/2026-06-18-reduce-msal-popups-design.md`.

**Tech Stack:** @azure/msal-browser 3.30.0, @azure/msal-react, Next.js static export, vitest (node env), sessionStorage.

> **DEPLOY GATE:** This is core auth. After build, the spec's **manual test matrix** must pass (real browser + Teams) before any deploy. Build + PR only; do **not** deploy from this plan.

---

## File Structure

- **New** `src/lib/formDraft.ts` — pure sessionStorage draft helpers (injectable storage → unit-testable in node). One responsibility: persist/restore arbitrary serializable drafts.
- **New** `src/lib/authActions.ts` — auth interaction primitives: pure `isInteractionInProgressError` + renewal loop-guard helpers (unit-tested), the `authReady` gate, `ssoSilentWithTimeout`, and `ensureFreshToken` (integration).
- **Modify** `src/lib/graphClient.ts` — `acquireTokenInteractive` browser branch → `ssoSilent`→`acquireTokenRedirect` via the shared primitives.
- **Modify** `src/app/layout.tsx` — resolve `authReady` after `handleRedirectPromise`; clear the renewal marker when `response.state` matches.
- **Modify** `src/app/new/page.tsx` — full-state draft save/restore; pre-flight `ensureFreshToken` in `handleSubmit`/`handleReauthenticate`.
- **Modify** `src/components/TicketDetail.tsx` (+ `CommentInput.tsx`), `ApprovalActionPanel.tsx`, `ReceiveActionPanel.tsx`, `DetailsPanel.tsx` — pre-flight gate + per-surface draft snapshots.

---

## Phase 1 — Pure helpers (TDD)

### Task 1: `formDraft.ts`

**Files:** Create `src/lib/formDraft.ts`, `src/lib/formDraft.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/formDraft.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { saveDraft, loadDraft, clearDraft } from "./formDraft";

function mockStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
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
    const s = mockStore(); s.setItem("helpdesk-draft:bad", "{not json");
    expect(loadDraft("bad", s)).toBeNull();
  });
  it("clears a draft", () => {
    const s = mockStore();
    saveDraft("k", { a: 1 }, s); clearDraft("k", s);
    expect(loadDraft("k", s)).toBeNull();
  });
  it("no-ops safely when storage is null (SSR)", () => {
    expect(() => saveDraft("k", { a: 1 }, null)).not.toThrow();
    expect(loadDraft("k", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify it fails**
Run: `npm test -- formDraft` · Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/formDraft.ts`:

```typescript
// Pure sessionStorage draft persistence. Storage is injectable so it's unit-testable
// in node (vitest 'node' env has no sessionStorage). Survives navigation/redirect.
export type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "helpdesk-draft:";

function defaultStore(): SessionLike | null {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : null;
}

export function saveDraft(key: string, value: unknown, store: SessionLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or non-serializable — drop silently */
  }
}

export function loadDraft<T = unknown>(key: string, store: SessionLike | null = defaultStore()): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, store: SessionLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run — verify it passes**
Run: `npm test -- formDraft` · Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/formDraft.ts src/lib/formDraft.test.ts
git commit -m "feat: add injectable-storage form draft helpers"
```

### Task 2: `authActions.ts` pure helpers

**Files:** Create `src/lib/authActions.ts`, `src/lib/authActions.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/authActions.test.ts`:

```typescript
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
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
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
```

- [ ] **Step 2: Run — verify it fails**
Run: `npm test -- authActions` · Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure portion** — create `src/lib/authActions.ts` with (the integration portion is added in Task 3):

```typescript
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
export function clearRenewalAttemptIfMatches(returnedState: string | undefined | null, s: SessionLike | null = store()): void {
  if (returnedState && s && s.getItem(RENEWAL_KEY) === returnedState) s.removeItem(RENEWAL_KEY);
}
```

- [ ] **Step 4: Run — verify it passes**
Run: `npm test -- authActions` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/authActions.ts src/lib/authActions.test.ts
git commit -m "feat: add auth interaction-error + renewal loop-guard helpers"
```

---

## Phase 2 — Auth integration (tsc/build-verified; covered by the manual matrix)

### Task 3: `ensureFreshToken` + `authReady` (append to `authActions.ts`)

**Files:** Modify `src/lib/authActions.ts`

- [ ] **Step 1: Append** the gate + pre-flight to `src/lib/authActions.ts`:

```typescript
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
```

- [ ] **Step 2: Type-check**
Run: `npx tsc --noEmit` · Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/lib/authActions.ts
git commit -m "feat: add ensureFreshToken pre-flight gate + authReady"
```

### Task 4: `graphClient.ts` — browser renewal → ssoSilent + redirect

**Files:** Modify `src/lib/graphClient.ts` (`acquireTokenInteractive`, browser branch `:67-78`)

- [ ] **Step 1: Add imports** near the existing msal import block:
```typescript
import { authReady, renewalRedirectAllowed, markRenewalAttempt, isInteractionInProgressError } from "./authActions";
```

- [ ] **Step 2: Replace the browser branch** of `acquireTokenInteractive`. Current (`:69-78`):
```typescript
  const key = [...request.scopes].sort().join(" ");
  let promise = interactiveTokenPromises.get(key);
  if (!promise) {
    promise = msalInstance
      .acquireTokenPopup({ ...request, account })
      .then((response) => response.accessToken)
      .finally(() => { interactiveTokenPromises.delete(key); });
    interactiveTokenPromises.set(key, promise);
  }
  return promise;
```
with:
```typescript
  const key = [...request.scopes].sort().join(" ");
  let promise = interactiveTokenPromises.get(key);
  if (!promise) {
    promise = (async () => {
      // 1. ssoSilent (Entra SSO cookie) — renews with no popup/redirect when the
      //    session cookie is alive (succeeds in non-ITP browsers where the cached
      //    token renewal just failed).
      try {
        const sso = await msalInstance.ssoSilent({ ...request, loginHint: account.username, account });
        return sso.accessToken;
      } catch {
        /* fall through */
      }
      // 2. Redirect — last resort. graphClient can't read msal-react's inProgress, so
      //    gate on authReady (set after layout's handleRedirectPromise) and tolerate the
      //    thrown interaction_in_progress instead of a precondition check.
      await authReady;
      if (!renewalRedirectAllowed()) {
        throw new InteractionRequiredAuthError("interaction_required", "Sign in required");
      }
      const state = `renewal:${account.homeAccountId}:${Date.now()}`;
      markRenewalAttempt(state);
      try {
        await msalInstance.acquireTokenRedirect({ ...request, account, state });
      } catch (e) {
        if (!isInteractionInProgressError(e)) throw e;
      }
      // The page is navigating away; never resolve.
      return new Promise<string>(() => {});
    })().finally(() => { interactiveTokenPromises.delete(key); });
    interactiveTokenPromises.set(key, promise);
  }
  return promise;
```

- [ ] **Step 3: Type-check + build**
Run: `npx tsc --noEmit && npm run build` · Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/lib/graphClient.ts
git commit -m "feat: browser token renewal uses ssoSilent then redirect (no popup)"
```

### Task 5: `layout.tsx` — resolve authReady + clear renewal marker by state

**Files:** Modify `src/app/layout.tsx`

- [ ] **Step 1: Add import:**
```typescript
import { markAuthReady, clearRenewalAttemptIfMatches } from "@/lib/authActions";
```

- [ ] **Step 2: Use the redirect response + signal authReady.** In `initializeMsal`, the line `const response = await msalInstance.handleRedirectPromise();` stays. Immediately after the `if (response) { ... } else { ... }` block that processes it, add a clear-by-state call where `response` is in scope (inside the `if (response)` branch, after `setActiveAccount`):
```typescript
          // A renewal redirect returns its state; clear the renewal guard only on a match
          clearRenewalAttemptIfMatches(response.state);
```
And at the very end of `initializeMsal`, right before `setIsInitialized(true);`, signal the gate (so graphClient/ensureFreshToken may redirect only after the initial redirect handling has settled):
```typescript
      markAuthReady();
      setIsInitialized(true);
```
(Move `markAuthReady()` into the same place even on the catch path — ensure it runs whether or not init threw, so token renewal is never permanently blocked. Place `markAuthReady()` in a `finally` around the try if cleaner.)

- [ ] **Step 3: Type-check**
Run: `npx tsc --noEmit` · Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add src/app/layout.tsx
git commit -m "feat: resolve authReady after redirect handling; clear renewal marker by state"
```

---

## Phase 3 — Form/panel wiring (draft snapshots + pre-flight)

### Task 6: New-ticket form — full-state draft + pre-flight

**Files:** Modify `src/app/new/page.tsx`

- [ ] **Step 1: Imports + draft key + snapshot:**
```typescript
import { saveDraft, loadDraft, clearDraft } from "@/lib/formDraft";
import { ensureFreshToken } from "@/lib/authActions";
import { graphScopes } from "@/lib/msalConfig";
```
Define near the top of the component:
```typescript
  const DRAFT_KEY = "new-ticket";
  const snapshotDraft = () => saveDraft(DRAFT_KEY, { formData, isPurchaseRequest, lineItems, purchaseShared });
```

- [ ] **Step 2: Restore on mount** (after the state declarations). The draft excludes `stagedFiles` (File[] can't serialize). Add:
```typescript
  const [draftRestoredNote, setDraftRestoredNote] = useState<string | null>(null);
  useEffect(() => {
    const d = loadDraft<{ formData: CreateTicketData; isPurchaseRequest: boolean; lineItems: PurchaseLineItem[]; purchaseShared: { justification: string; project: string } }>(DRAFT_KEY);
    if (d) {
      setFormData(d.formData);
      setIsPurchaseRequest(d.isPurchaseRequest);
      setLineItems(d.lineItems);
      setPurchaseShared(d.purchaseShared);
      setDraftRestoredNote("We restored your in-progress ticket. Please re-attach any files.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Auto-save on change.** Add:
```typescript
  useEffect(() => {
    saveDraft(DRAFT_KEY, { formData, isPurchaseRequest, lineItems, purchaseShared });
  }, [formData, isPurchaseRequest, lineItems, purchaseShared]);
```

- [ ] **Step 4: Pre-flight in `handleSubmit`.** At the very top of the `try` in `handleSubmit` (before `createTicket`), add:
```typescript
      const ok = await ensureFreshToken(instance, accounts[0], graphScopes, {
        onBeforeRedirect: snapshotDraft,
      });
      if (!ok) { setSessionExpired(true); return; }
```

- [ ] **Step 5: Replace `handleReauthenticate`'s browser popup.** Swap `await instance.acquireTokenPopup({ ...graphScopes, account: accounts[0] });` (`:247`) for:
```typescript
        const ok = await ensureFreshToken(instance, accounts[0], graphScopes, { onBeforeRedirect: snapshotDraft });
        if (!ok) { setError("Please sign in to continue."); return; }
```

- [ ] **Step 6: Clear draft on success.** After a successful submit (where the form resets / navigates), add `clearDraft(DRAFT_KEY);`. Render `draftRestoredNote` as a small banner near the top of the form if set.

- [ ] **Step 7: Type-check + build**
Run: `npx tsc --noEmit && npm run build` · Expected: no errors.

- [ ] **Step 8: Commit**
```bash
git add src/app/new/page.tsx
git commit -m "feat: new-ticket full-state draft + pre-flight token gate (popup-free)"
```

### Task 7: Ticket-detail write surfaces — pre-flight + snapshots

**Files:** Modify `src/components/TicketDetail.tsx`, `src/components/CommentInput.tsx`, `src/components/ApprovalActionPanel.tsx`, `src/components/ReceiveActionPanel.tsx`, `src/components/DetailsPanel.tsx`

Apply the **same pattern** at each write entry point: snapshot the surface's unsaved state to a draft keyed by `ticket id + surface`, then `ensureFreshToken(...)` before the mutating Graph call; restore the draft on mount.

- [ ] **Step 1: Comment box.** In `TicketDetail.handleAddComment` (the handler that calls `addComment`), before the `getGraphClient`/`addComment` call:
```typescript
    const ok = await ensureFreshToken(instance, accounts[0], graphScopes, {
      onBeforeRedirect: () => saveDraft(`comment:${ticket.id}`, { text, isInternal }),
    });
    if (!ok) { console.error("Sign in required to comment"); return; }
```
In `CommentInput.tsx`, on mount restore: `const d = loadDraft<{text:string;isInternal:boolean}>(\`comment:${ticketId}\`); if (d) { setText(d.text); setIsInternal(d.isInternal); }` and `clearDraft` after a successful post. (Pass `ticketId` to `CommentInput` if not already available.)

- [ ] **Step 2: Approval "Approve & Ordered" (highest-value).** In `TicketDetail.handleApprovalDecision` (calls `processApprovalDecision`), before the write:
```typescript
    const ok = await ensureFreshToken(instance, accounts[0], graphScopes, {
      onBeforeRedirect: () => saveDraft(`approval:${ticket.id}`, { decision, notes, options }),
    });
    if (!ok) return;
```
In `ApprovalActionPanel.tsx`, restore `notes` + `orderItems` from `loadDraft(\`approval:${ticket.id}\`)` on mount; clear on a recorded decision.

- [ ] **Step 3: Receive panel + Details panel.** Same pattern in `ReceiveActionPanel`'s `onMarkReceived` path (snapshot `{ receivedItems, notes }` under `receive:${ticket.id}`) and `DetailsPanel.handleSave` (snapshot the edited fields under `details:${ticket.id}`), each with `ensureFreshToken` before the mutating call and restore-on-mount.

- [ ] **Step 4: Type-check + build**
Run: `npx tsc --noEmit && npm run build` · Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add src/components/TicketDetail.tsx src/components/CommentInput.tsx src/components/ApprovalActionPanel.tsx src/components/ReceiveActionPanel.tsx src/components/DetailsPanel.tsx
git commit -m "feat: pre-flight token gate + draft snapshots on ticket-detail write surfaces"
```

---

## Phase 4 — Verify

### Task 8: Full verification + manual matrix

- [ ] **Step 1: Unit + build**
Run: `npm test && npx tsc --noEmit && npm run build` · Expected: all pass; build OK.

- [ ] **Step 2: Adversarial code-review** of the diff (workflow / Codex) before PR — focus on the auth flow (interaction_in_progress handling, the never-resolving renewal promise, authReady ordering, marker disarm).

- [ ] **Step 3: Manual test matrix (REQUIRED before deploy — needs real Entra/browser/Teams):** run every row from the spec's "Testing → Manual matrix" (fresh login, read renewal, new-ticket draft + no-duplicate, comment, Approve & Ordered, receive, details, attachment SharePoint-scope redirect, loop guard, Teams, multi-tab).

- [ ] **Step 4: PR** (do NOT deploy from this plan):
```bash
git push -u origin feature/reduce-msal-popups
gh pr create --base main --title "Reduce MSAL browser popups (popup-free auth + draft safety)" --body "<summary + the manual matrix as the merge checklist>"
```

---

## Self-Review (completed during planning)
- **Spec coverage:** ensureFreshToken pre-flight (Task 3,6,7) ✓; ssoSilent+timeout+justification (Task 3) ✓; authReady + catch interaction_in_progress, no inProgress check (Tasks 3,4) ✓; loop guard by state, distinct key (Tasks 2,4) ✓; full new-ticket draft incl. purchase slices + staged-files notice (Task 6) ✓; all detail-write surfaces snapshotted (Task 7) ✓; mid-write/duplicate prevented by pre-flight before createTicket (Task 6) ✓; Teams unchanged ✓; manual matrix gate (Task 8) ✓.
- **No popups:** the two `acquireTokenPopup` (graphClient:73, new:247) are the only browser popups and both are replaced (Tasks 4,6). Login already redirect.
- **Type/name consistency:** `saveDraft/loadDraft/clearDraft`, `ensureFreshToken`, `authReady`/`markAuthReady`, `isInteractionInProgressError`, `renewalRedirectAllowed`/`markRenewalAttempt`/`clearRenewalAttemptIfMatches`, `RENEWAL_KEY` — consistent across tasks.
- **Testability:** sessionStorage injected → node-testable (Tasks 1,2); integration verified by tsc/build + the manual matrix (auth needs real Entra).
