# Email-First Approvals & Ticket Participants — Design

- **Date:** 2026-06-16
- **Status:** Draft (awaiting review)
- **Author:** Justin + Claude
- **Branch:** `feature/email-first-approvals`

## Overview

Two related features that let ticket owners and approvers interact with the Help
Desk almost entirely from their inbox:

- **Piece A — Approve / Deny / Request Changes by email.** Approval-request
  emails carry signed action buttons. Tapping one opens a branded confirmation
  page (no login), optionally lets the approver attach a message, and records the
  decision server-side.
- **Piece C — Ticket participants & comment notifications.** A ticket gains an
  explicit participant list (auto-discovered + manually added). Every new comment
  notifies all participants; internal notes notify staff participants only;
  participants also receive approval-decision and status-change emails.

Two further ideas from the same conversation are **out of scope** for this spec and
become their own follow-up specs:

- **Piece B — Reply-by-email → ticket comment** (inbound mail pipeline). Not
  needed for approvals because the confirmation page captures the message inline.
- **Piece D — Reduce MSAL auth popups** (redirect/silent token flows). Orthogonal
  to email features.

## Goals & Non-Goals

**Goals**
- An approver can approve, deny, or request changes on any ticket — including
  purchase requests that spend money — without logging in, from any device.
- The action is safe against corporate mail-scanner link prefetching.
- Everyone involved in a ticket is kept in the loop on comments, decisions, and
  status changes, with internal notes never leaking to requesters.
- Staff can explicitly add people to a ticket's notification audience.

**Non-Goals**
- Rich purchase decisions ("Approve with Changes", "Approve & Ordered") are **not**
  performed from email — they need per-item data entry and continue to link into
  the app.
- No inbound email parsing (Piece B).
- No auth/popup changes (Piece D).
- No notification digesting/batching — every comment sends immediately.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Email decision set | Approve + Deny + **Request Changes** (Request Changes requires a note) |
| Purchase (money) approvals | **Yes** — one-tap by email like all others |
| Message capture | **Inline note** on the confirmation page; decision + note in one POST (no mailto) |
| Confirmation page hosting | **Approach 1** — branded `/approve` static page on `tickets.spsvent.net` |
| Comment recipients | **All participants**: requester + assignee + approver + prior commenters + manually-added |
| Internal-note recipients | Participants **with a staff RBAC role** only — never the requester or non-staff adds |
| Who can add participants | **Anyone with ticket access**, including the requester |
| Addable people | **Directory employees only** (Azure AD picker) |
| What added participants receive | Comments **+** decision **+** status updates (full watcher) |
| Status-change emails | **Build now** — new lightweight email on status transitions |
| Token lifetime | Signed HMAC, **14-day** expiry, single-use via decision-state check |

## Architecture

### Why approval emails must be minted server-side

Approval action links must be cryptographically signed so they cannot be forged.
The signing secret can never live in the browser bundle (every `NEXT_PUBLIC_*`
value ships to the client). Therefore the approval-*request* email — the one that
embeds the signed buttons — must be built and sent by an Azure Function, not by
`emailService.ts` in the browser as today. This is the central structural change.

### New building blocks

#### 1. `approvalToken` module — `azure-functions/src/lib/approvalToken.js`
- `sign(payload)` / `verify(token)` using Node's built-in `crypto` (HMAC-SHA256).
- Payload claims: `{ tid, action, email, name, iat, exp, jti }`
  - `tid` — ticket id
  - `action` — `approve` | `deny` | `changes`
  - `email` / `name` — approver identity the decision is attributed to
  - `iat` / `exp` — issued-at / expiry (default 14 days)
  - `jti` — random id (uniqueness; reserved for future replay tracking)
- Token format: `base64url(payload).base64url(hmac)`. No secrets inside — just
  signed claims.
- Secret: new Function App env var `APPROVAL_LINK_SECRET`.

#### 2. `sendApprovalRequest` Function — new HTTP endpoint (anonymous, **pending-gated**)
- Replaces the client-built approval-request email.
- Input: ticket id (+ requester name for display only).
- **Security gate:** because this endpoint is anonymous and *mints capabilities*,
  it only proceeds when the ticket's `ApprovalStatus` is genuinely `Pending`. This
  blocks an anonymous caller from spamming GMs with approval emails for arbitrary
  or already-decided tickets. (Chosen over full bearer-token validation for
  simplicity; tokens are emailed to GMs, never returned to the caller.)
- Resolves approver recipients (GM group) **with display names** for attribution.
- For **each** recipient, mints a **per-recipient** token per action and builds
  that recipient's email with three buttons. Per-recipient tokens mean the
  decision is correctly attributed to whoever actually clicked.
- Sends via the existing app-only Graph mail path (same as `SendEmail`).

#### 3. `approvalAction` Function — new HTTP endpoint (anonymous)
- `GET ?token=…` → **side-effect-free**: verify token, return a ticket summary
  (number, title, requester, approval/purchase details, current ApprovalStatus).
  Safe for mail-scanner prefetch because it changes nothing.
- `POST { token, note }` → verify token, then execute the decision server-side
  with app-only Graph:
  - Update SharePoint approval fields (`ApprovalStatus`, `ApprovalDate`,
    `ApprovedByName`/`ApprovedByEmail`, `ApprovalNotes`, and purchase
    `PurchaseStatus`) — attributed to the **token's** approver, since nobody is
    logged in. Mirrors `processApprovalDecision()` in `graphClient.ts`.
  - Uses **ETag `If-Match`** optimistic concurrency on the write so two
    near-simultaneous clicks can't both pass the terminal-status check (closes the
    TOCTOU replay race).
  - Records the decision as a single **internal** comment (`📋 **<decision>** by
    <name>` plus the optional note). The note is staff-internal; the requester
    still sees it via the decision email.
  - Logs the activity event (same field schema as the in-app `logActivity`:
    `Title`/`EventType`/`Actor`/`TicketId`/`TicketNumber`/`ActorName`/`Details`).
  - Sends the decision email to **participants** (Piece C resolver).
- Enforces: `Request Changes` requires a non-empty `note`.

#### 4. `/approve` page — new app route `src/app/approve/page.tsx`
- Static, **no authentication**. Reads `token` from the query string.
- Calls `approvalAction` `GET` to render a branded confirmation card: ticket
  summary, purchase details when relevant, an optional **message box** (required
  iff `action === changes`), and a single **Confirm** button.
- On Confirm → `POST` the decision + note → show success state
  ("✓ Approved — you can close this tab").
- Renders friendly terminal states for: expired token, already-decided ticket,
  invalid/tampered token — each with a "Open the ticket in the app" link.

### Piece A — flow end to end

```
Approval requested
   └─> frontend calls sendApprovalRequest(ticketId)
          └─> each GM receives an email w/ 3 signed buttons (their own tokens)

GM taps "Approve"
   └─> tickets.spsvent.net/approve/?token=…   (no login)
          └─> GET approvalAction → render ticket summary + optional note box
                 └─> GM taps "Confirm" (+ optional note)
                        └─> POST approvalAction
                               ├─ update SharePoint (If-Match, attributed to token approver)
                               ├─ internal decision comment (incl. note)
                               ├─ activity log event
                               └─ decision email → participants
                        └─> page shows "✓ Approved"
```

- **Request Changes** is identical, but the note box is **required**.
- Rich decisions (Approve-with-Changes, Approve-&-Ordered) are **not** email
  buttons; the email includes an "Open ticket to order/edit →" link for those.

### Piece C — participants & notifications

#### Participant resolver
`getTicketParticipants(ticket)` returns the de-duplicated union, minus the actor:
- requester
- current assignee
- approver (`ApprovedByEmail`, once a decision exists)
- everyone who previously commented (public comments)
- **manually-added** participants (`ParticipantEmails`)

This single resolver feeds **every** ticket notification.

#### Storage
- One new Tickets column: **`ParticipantEmails`** (multi-line text; a delimited
  list of emails). Consistent with the app's existing preference for storing
  people as text rather than SharePoint person fields.

#### Participants UI
- New **Participants** section on the ticket detail page (`TicketDetail.tsx`).
- Shows current participants (auto-discovered ones as read-only chips; manually
  added ones removable).
- Add control = Azure AD **directory people picker**. Directory employees only.
- **Anyone with ticket access** (including the requester) can add/remove manual
  participants. Auto-discovered participants cannot be removed.

#### Notification routing
| Event | Recipients |
|-------|------------|
| Public comment | All participants |
| Internal comment | Participants **with a staff RBAC role** only |
| Approval decision | Existing recipients **∪** participants |
| Purchase-workflow step | Role recipients (purchaser/inventory) + requester — participants are covered via the decision + status-change emails, not separately on PurchaseStatus transitions |
| **Status change** (new) | All participants (incl. prior public commenters) |

- **Internal-note gate** keys off RBAC role, not directory membership — a
  manually-added regular employee never receives internal notes.
- **No batching** — every comment emails immediately.

#### New status-change email
- Fires on ticket status transitions (e.g. → In Progress, → Resolved, → Closed).
- Lightweight template ("Ticket #N is now <status>") to all participants.
- Hooks the existing status-change code path that already writes the activity log.

## Data Model & Configuration

### SharePoint
- **Tickets** list: add `ParticipantEmails` (multi-line text).

### Environment variables
| Variable | Where | Purpose |
|----------|-------|---------|
| `APPROVAL_LINK_SECRET` | Function App settings (Azure Portal) | HMAC signing secret (server-only) |
| `NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL` | GitHub Actions workflow `env:` | Frontend → sendApprovalRequest endpoint |
| `NEXT_PUBLIC_APPROVAL_ACTION_URL` | GitHub Actions workflow `env:` | `/approve` page → approvalAction endpoint |

`NEXT_PUBLIC_*` values are baked at build time and **must** be added to
`.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml`, not the
Azure Portal (per project conventions).

## Security Model

- **Forgery:** Actions require a valid HMAC signature over the claims; the secret
  never leaves the Function App.
- **Endpoint auth:** `approvalAction` is anonymous because the **token is the
  capability** (no valid token → no action). `sendApprovalRequest` is different —
  it *creates* capabilities — so it is anonymous **but pending-gated**: it only
  mints and sends when the ticket's `ApprovalStatus` is genuinely `Pending`.
- **Mail-scanner prefetch:** Only `POST` mutates state. `GET` is a read-only
  summary, so a scanner pre-opening the link cannot approve anything.
- **Replay / reuse:** A second click after a **terminal** decision (Approved or
  Denied) sees the changed `ApprovalStatus` and shows "already decided." **Request
  Changes is non-terminal** — it sets `Changes Requested` but leaves the Approve
  and Deny links live, so an approver can request changes and later still
  approve/deny from the same email. The write uses **ETag `If-Match` optimistic
  concurrency**, so two near-simultaneous clicks can't both pass the status check
  and both write (the TOCTOU race) — the loser gets "already decided." `jti`
  remains reserved for a future one-time-use store.
- **Expiry:** 14 days; expired links route the approver into the app.
- **Attribution:** The decision records the **token's** approver identity (since
  no one is logged in). Per-recipient tokens keep multi-GM attribution correct.
- **Trust surface:** Links point at the real, recognized `tickets.spsvent.net`
  domain rather than a raw `azurewebsites.net` URL.

## Error & Edge-Case Handling

| Situation | Behavior |
|-----------|----------|
| Expired token | Confirmation page: "This link has expired — open the ticket." |
| Already decided | "This was already <Approved/Denied/…> by <name> on <date>." |
| Invalid / tampered token | Generic "This link isn't valid" + app link. |
| Request Changes with empty note | Confirm button disabled until note entered. |
| Ticket fetch fails server-side | Friendly error; no partial write. |
| Add participant already present | No-op / de-duplicated. |
| Manually-added non-staff employee | Gets public comments + decision + status; never internal notes. |

## Testing Strategy

- **Unit:** `approvalToken` `sign`/`verify` — round-trip, tampered payload,
  tampered signature, expired `exp`, wrong `action`.
- **Unit:** `getTicketParticipants` — de-dup, actor exclusion, internal-note staff
  gate, manual adds merged.
- **Manual end-to-end:** request approval → receive email → tap each of the three
  buttons → confirm with/without note → verify SharePoint fields, comment,
  activity log, and participant decision emails. Re-tap a used link → "already
  decided."
- **Manual:** add/remove a participant; post a public and an internal comment;
  confirm recipient sets; trigger a status change → participants emailed.

## Help Documentation (required by project conventions)

Update `src/app/help/page.tsx`:
- New section **"Approving by email"** — what the buttons do, the confirmation
  page, attaching a message, the expiry/already-decided behavior.
- Update the notifications section to describe **participants**, who is
  auto-included, how to add people, and the public-vs-internal rule.

## File-by-File Change Outline

**Azure Functions (`azure-functions/`)**
- `src/lib/approvalToken.js` — new (sign/verify).
- `src/functions/sendApprovalRequest.js` — new endpoint.
- `src/functions/approvalAction.js` — new endpoint (GET summary + POST execute).
- Decision-execution + participant-resolver helpers (server-side mirror of the
  frontend approval logic).

**Frontend (`src/`)**
- `app/approve/page.tsx` — new no-login confirmation page.
- `lib/participants.ts` — `getTicketParticipants()` resolver + staff-role gate.
- `lib/emailService.ts` — route comment/decision emails through the participant
  resolver; add the status-change template.
- `lib/graphClient.ts` — `ParticipantEmails` read/write; trigger
  `sendApprovalRequest`; status-change notification hook.
- `components/TicketDetail.tsx` — Participants section; wire participant resolver
  into comment/decision/status flows.
- `components/ParticipantsPanel.tsx` (or similar) — new participants UI + directory
  picker.
- `types/ticket.ts` — add `participantEmails` to the ticket model.
- `app/help/page.tsx` — help updates.

**Config**
- `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml` — new
  `NEXT_PUBLIC_*` vars.
- Function App settings — `APPROVAL_LINK_SECRET`.

## Future / Follow-up Specs

- **Piece B — Reply-by-email → comment** (inbound mail pipeline). Would let any
  email reply become a comment, generalizing the inline-note idea.
- **Piece D — Reduce MSAL auth popups** (redirect/silent flows), building on the
  recent Teams session-renewal work.
