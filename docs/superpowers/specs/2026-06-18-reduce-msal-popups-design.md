# Reduce MSAL Browser Popups (Piece D) — Design

- **Date:** 2026-06-18
- **Status:** Draft — design-first (build/deploy decided separately; high-stakes auth)
- **Branch:** `feature/reduce-msal-popups`
- **Reviewed:** Adversarial multi-lens verification (MSAL-correctness, lockout/loop, codebase-consistency, completeness) — this revision incorporates the 8 verified findings. See "Review history" at the end.

## Overview

Make the browser experience popup-free for authentication **without losing unsaved
work**. The hard lesson from review: today's `acquireTokenPopup` keeps the page alive,
so it silently protects *every* in-progress form/edit in the app. A naive
"popup → redirect" swap unloads the page and would **lose data in more places than it
fixes**. So the design is not just "swap the API" — it's "make the unavoidable
interactive moment happen at a **safe time** (before a write, after snapshotting a
draft), never mid-action." The Teams path is **out of scope** (a Teams webview can't
redirect; its Teams-controlled popup is required and was just hardened).

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Popup scope | Eliminate **both** browser popups (sign-in + token renewal) |
| Mid-edit form state on redirect | **Preserve + restore** via sessionStorage drafts |
| Teams | Unchanged — keeps the Teams-controlled popup |

## Current state (verified against code)

**Browser sign-in already uses redirect.** All three login handlers take the browser
branch to `loginRedirect` (`page.tsx:283`, `new/page.tsx:229`, `settings/page.tsx:66`).
The `loginPopup` calls (`page.tsx:275`, `new:223`, `settings:60`) are **only reached
inside Teams** as a fallback. **No change needed for login.**

**The only browser popups are two `acquireTokenPopup` (token renewal) calls:**
1. `graphClient.ts:73` — inside `acquireTokenInteractive` (the browser branch), reached
   from the Graph `authProvider` (`getGraphClient`, `:101-123`) and `getSharePointToken`
   (`:82-92`) when `acquireTokenSilent` throws `InteractionRequiredAuthError`. This path
   serves **every** Graph/SharePoint call in the app.
2. `new/page.tsx:247` — `handleReauthenticate`, a **deliberate** popup ("re-authenticate
   without leaving the page so the filled-in form survives"). Triggered from
   `handleSubmit` (`:538`) after the user filled the whole form.

**Surfaces the popup currently protects** (page stays alive → React state survives) —
all reached through that one `acquireTokenInteractive` path:
- New-ticket form: `formData` **plus** `isPurchaseRequest` (`new:92`), `lineItems`
  (`new:93`), `purchaseShared {justification, project}` (`new:94`), `stagedFiles: File[]`
  (`new:106`).
- `CommentInput` `text`/`isInternal` (`CommentInput.tsx:11-12`).
- `ApprovalActionPanel` `notes` (`:37`) + per-line-item vendor/order#/cost/delivery
  `orderItems` (`:43`) — the **highest-value** loss (GM "Approve & Ordered").
- `ReceiveActionPanel` `receivedItems` + `notes` (`:15-22`).
- `DetailsPanel` inline edits: status/priority/category/problemType/assignee (`:97-106`).

**Relevant machinery:**
- `msalConfig.ts`: `cacheLocation: "localStorage"` (`:14`, tokens shared across tabs),
  `storeAuthStateInCookie: true` (iOS Safari ITP workaround). `redirectUri = origin`.
- `layout.tsx:80` calls `handleRedirectPromise()` on load. `validateCachedSession`
  fires a **fire-and-forget** `loginRedirect` at startup (`:101 → :59`) and sets a
  redirect-loop marker `helpdesk-reauth-attempted` (`:57`) that is **never cleared**
  anywhere in the repo.
- `graphClient.ts:31` keeps a per-scope `interactiveTokenPromise` map (dedupes only
  within graphClient; does **not** coordinate with `layout`'s `loginRedirect`).

## Architecture

The design has four parts: a **pre-flight token gate** for writes, **draft snapshots**
taken right before any redirect, a **safe lazy renewal** (read safety-net) in
`graphClient`, and a **correct redirect-loop guard**.

### 1. `ensureFreshToken()` — pre-flight gate for write actions (new helper)

New `src/lib/authActions.ts`:

```
ensureFreshToken(instance, account, request, { isTeams, onBeforeRedirect }): Promise<boolean>
```

Order:
1. `acquireTokenSilent(request)` → success: return `true` (no interaction).
2. On `InteractionRequiredAuthError`: in **Teams** → `openTeamsAuthPopup()` (unchanged);
   in **browser** → `ssoSilent({ ...request, loginHint: account.username })` **with a
   5 s timeout** (mirroring the Teams SSO timeout at `layout.tsx:113-116`) → success:
   return `true`.
   - **Why `ssoSilent` after `acquireTokenSilent` already failed:** they fail for
     *different* reasons. `acquireTokenSilent` renews from the **cached** refresh/access
     token; it can fail when the cache is stale/cleared or past Entra's ~24 h SPA
     refresh-token cap *even though the Entra SSO **cookie** is still alive*. `ssoSilent`
     uses that cookie. So in **non-ITP** browsers (Edge/Chrome — the likely org default)
     `ssoSilent` can succeed silently where `acquireTokenSilent` failed. On **Safari/ITP**
     the third-party cookie iframe is blocked and `ssoSilent` throws `login_required`
     (AADSTS50058) — the 5 s timeout caps the wasted latency and we fall through.
3. Still interactive-required (browser): **call `onBeforeRedirect()`** (the caller's
   draft-snapshot closure), then start the loop-guarded redirect (§4) via
   `acquireTokenRedirect`. The promise never resolves (page unloads) — callers must
   treat a `false`/non-return as "redirecting."

**Call sites (write handlers), each snapshots its own surface first:**
- `new/page.tsx handleSubmit`: `await ensureFreshToken(..., { onBeforeRedirect: () =>
  saveDraft('new-ticket', fullNewTicketState) })` **before** `createTicket` — so any
  redirect happens **before** the first write (no partial create, no duplicate). On
  return the form restores from draft.
- `TicketDetail.handleAddComment`, `ApprovalActionPanel onDecision`,
  `ReceiveActionPanel onMarkReceived`, `DetailsPanel handleSave`: same pattern, each with
  its own `onBeforeRedirect` snapshot (comment text; approval notes+orderItems; receive
  items+notes; details edits) keyed by ticket id + panel.

This makes the interactive redirect fire **at the start of an action, after the draft is
saved** — never mid-write and never silently dropping work.

### 2. Draft persistence (new `src/lib/formDraft.ts`, pure + unit-tested)

`saveDraft(key, obj)` / `loadDraft(key)` / `clearDraft(key)` over `sessionStorage`.

- **New-ticket** persists the **full** editable state: `formData` **and**
  `isPurchaseRequest`, `lineItems`, `purchaseShared`. **`stagedFiles` (`File[]`) cannot
  be serialized** — on restore, show a "re-attach your files" notice rather than silently
  dropping them. Auto-save on change (debounced) + restore on mount; `clearDraft` on
  successful submit.
- **ApprovalActionPanel** (highest-value): persist `notes` + `orderItems` keyed by ticket
  id; restore on mount; clear on success.
- **CommentInput / ReceiveActionPanel / DetailsPanel**: snapshot via `onBeforeRedirect`
  at action time and restore on return. (These are lower-value; if a future decision
  prefers to accept their loss, document it explicitly per surface — but the default is
  to snapshot.)

### 3. Safe lazy renewal in `graphClient` (read safety-net)

The lazy per-call path (`acquireTokenInteractive`, browser branch, `graphClient.ts:67-78`)
still exists for calls that *don't* go through a pre-flight gate (mostly **reads**, where
a redirect loses nothing). Two corrections vs the naive swap:

- **No `inProgress` precondition check.** `graphClient` holds only
  `IPublicClientApplication`, which exposes **no** synchronous interaction-status getter,
  and `getActiveAccount()` does **not** detect an in-flight interaction (verified against
  msal-browser v3.30.0). Instead:
  - Gate every `acquireTokenRedirect` behind a module-level **`authReady`** promise that
    `layout.tsx` resolves once its initial `handleRedirectPromise()` settles — closing the
    startup race where `validateCachedSession`'s fire-and-forget `loginRedirect` is mid-flight.
  - Wrap `ssoSilent`/`acquireTokenRedirect` in `try/catch` that explicitly handles
    `BrowserAuthError` codes **`interaction_in_progress`** and **`redirect_in_iframe`**:
    on those, do **not** `done(error)` — set the redirecting/loop-guard state and let the
    in-flight interaction finish (or surface the "Redirecting…" UX).
- Reuse the per-scope `interactiveTokenPromise` map so concurrent failing calls coalesce
  to one redirect.

### 4. Redirect-loop guard (correct disambiguation)

- Use a **distinct** key `helpdesk-token-renewal-attempted` (separate from the login
  `helpdesk-reauth-attempted`).
- Before `acquireTokenRedirect`, set the marker **and** a `state` discriminator on the
  request (`state: "renewal:<nonce>"`). In `layout.tsx`, after `handleRedirectPromise()`
  resolves, **only clear the renewal marker if `response.state` matches** a renewal
  request (a login return must not clear it). Equivalent acceptable alternative: a
  **count/time-window** guard ("≤ N renewal redirects per M seconds").
- If the marker is already set when interactive is needed again (we just bounced and
  *still* can't get a token — revoked session / CA policy / missing consent), **do not
  redirect**; surface the existing "Sign in" CTA. Prevents the storm the guard exists for.
- Also clear the latent never-cleared login marker (`helpdesk-reauth-attempted`) on a
  matching login return, while we're here.
- Show a brief **"Redirecting to sign in…"** state instead of an error flash.

### 5. Teams — unchanged

Teams branches (`openTeamsAuthPopup`, login handlers, `layout` reauth banner,
`auth-callback`) untouched.

## Components / files

- **New** `src/lib/formDraft.ts` — pure sessionStorage draft helpers (unit-tested).
- **New** `src/lib/authActions.ts` — `ensureFreshToken()` + the `authReady` gate +
  `isInteractionInProgressError(e)` predicate + loop-guard helpers (the pure predicate
  is unit-tested).
- **Modify** `src/lib/graphClient.ts` — `acquireTokenInteractive` browser branch →
  `ssoSilent`(timeout)→`acquireTokenRedirect`; `authReady` gate; catch
  `interaction_in_progress`/`redirect_in_iframe`.
- **Modify** `src/app/layout.tsx` — resolve `authReady` after `handleRedirectPromise`;
  clear renewal/login markers by matching `response.state`; keep existing behavior.
- **Modify** `src/app/new/page.tsx` — `handleSubmit`/`handleReauthenticate` use
  `ensureFreshToken` + full-state draft (incl. purchase slices; staged-files notice).
- **Modify** `TicketDetail.tsx`, `ApprovalActionPanel.tsx`, `ReceiveActionPanel.tsx`,
  `DetailsPanel.tsx` — pre-flight `ensureFreshToken` with per-surface `onBeforeRedirect`
  snapshots; restore on mount where applicable.
- (No change to login handlers or Teams fallbacks.)

## Failure modes & safeguards

| Risk | Mitigation |
|------|------------|
| `interaction_in_progress` thrown (startup `validateCachedSession` redirect mid-flight, or concurrent calls) | `authReady` gate + catch the thrown `BrowserAuthError` code; don't `done(error)` |
| Redirect storm / lockout loop | Distinct renewal marker matched by `response.state`; after one failed round-trip, stop redirecting → "Sign in" CTA |
| Guard self-disarm (login return clears renewal marker) | Clear only when `response.state` matches a renewal request (or count/time-window guard) |
| Lost form data on renewal redirect | Pre-flight gate redirects **before** the write, after `onBeforeRedirect` snapshots the surface; restore on return |
| Mid-write redirect → duplicate ticket | Pre-flight gate at top of `handleSubmit` ensures any redirect precedes `createTicket`; `processApprovalDecision` PATCH→verify→PATCH is idempotent on retry |
| `stagedFiles` not serializable | Restore shows a "re-attach files" notice (can't persist `File[]`) |
| `ssoSilent` blocked by ITP / hung iframe | 5 s timeout; falls through to redirect (no worse than today's popup) |
| Multi-tab simultaneous expiry | Per-tab marker → each tab bounces **once** (MSAL interaction status is per-tab; bounded, not a storm); shared-localStorage token then propagates. Accepted behavior, no cross-tab lock needed |
| Static export → no runtime kill-switch | Rollback = revert PR + redeploy; ship deliberately, well-tested |

## Rollout / rollback

Core auth — **no fast build-and-deploy.** The manual matrix below must pass first.
Rollback is `git revert` + redeploy (static export has no runtime flag). Deploy on its
own, not bundled, so a regression is unambiguous.

## Testing

- **Unit (vitest/`node:test`):** `formDraft` save/load/clear round-trips (incl. purchase
  slices; `File[]` excluded); the loop-guard predicate (marker set + non-matching state →
  don't clear / don't redirect); `isInteractionInProgressError` recognizes the
  `interaction_in_progress`/`redirect_in_iframe` codes.
- **Manual matrix (must pass before deploy):**
  - Browser fresh login → redirect, no popup (regression check; already true).
  - Mid-session token expiry on a **read** → renews via silent/`ssoSilent`; if forced
    interactive, redirects (no popup) and returns to the same place.
  - **New-ticket**: fill incl. purchase line items + justification + staged files, force a
    renewal redirect on Submit → form (incl. purchase slices) restored; staged-files
    re-attach notice shown; **no duplicate ticket** created.
  - **Comment**: type a comment, force a redirect on Post → text restored / documented.
  - **Approval "Approve & Ordered"**: enter vendor/order#/cost across 2+ line items, force
    a redirect on Confirm → restored.
  - **Receive panel** + **DetailsPanel inline edits** across a redirect.
  - **Attachment**: force a **SharePoint-scope** (`getSharePointToken`) redirect mid-upload
    (distinct interactive path from Graph).
  - **Loop guard**: simulate persistent silent+ssoSilent failure → at most one redirect,
    then "Sign in" CTA (no storm); a login return does **not** disarm the renewal guard.
  - **Teams** (desktop + web): unchanged (Teams popup; no redirect).
  - **Multi-tab**: all tabs expiring simultaneously → each bounces once, then proceeds.

## Out of scope
- Teams auth flow (intentionally unchanged).
- Login-handler popups (already redirect in browser; Teams-only otherwise).
- Eliminating interactive auth entirely (Entra caps SPA refresh tokens ~24 h — only
  minimized via proactive silent/`ssoSilent`, never zero).

## Review history
An adversarial verification workflow (4 lenses × per-finding verification, read MSAL
v3.30.0 source) returned **10 confirmed findings**; verdict *"not safe to build as
written; safe after correction."* This revision incorporates all of them:
the unreachable `inProgress` guard → `authReady` + catch `interaction_in_progress`;
draft persistence broadened from `formData`-only to the full new-ticket state + all
detail-write surfaces (the popup-replacement regression); loop-guard disambiguation by
`response.state`; mid-write/duplicate-ticket prevention via the pre-flight gate;
`ssoSilent` justified + timeout-bounded; expanded test matrix; multi-tab documented as
bounded/accepted.
