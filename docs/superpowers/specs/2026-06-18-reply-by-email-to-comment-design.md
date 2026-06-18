# Reply-by-Email → Ticket Comment (Piece B) — Design

- **Date:** 2026-06-18
- **Status:** Approved — building
- **Branch:** `feature/inbound-reply-to-comment`

## Overview

Let anyone on a ticket reply to a Help Desk notification email and have that reply
land as an in-ticket comment — completing the "interface 100% through email" vision
(Piece A let owners *act* by email; this lets everyone *converse* by email).

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Ingestion | **Poll** the `supportdesk@` inbox on a timer (~2 min) — matches existing `checkEscalations`/`syncToVikunja` timers; no subscription renewal |
| Sender trust | **Directory users only** — `From` must resolve to an Azure AD user; others left unread for human triage |
| Comment visibility | **Public always** — inbound replies join the visible conversation |
| Quoted-text stripping | Graph **`uniqueBody`** (text) — Exchange removes the quoted history for us; no reply-parser library |
| Loop safety | Skip **auto-replies** (`Auto-Submitted` header / "Automatic reply:" subject) and self-sent mail |
| Scope (out) | Reply **attachments** (text only); creating **new tickets** from cold email |

## Prerequisite (admin)

The function app's Azure AD app currently has `Mail.Send` + `Sites.ReadWrite.All` +
`User.Read.All`. Inbound needs **`Mail.ReadWrite`** (application) + **admin consent** —
to read the inbox and mark messages processed. Without it the poller reads nothing and
the feature is dark.

## Architecture

One new timer function, `pollInboundReplies`, plus a pure parsing helper and a
server-side comment email template. All under `azure-functions/`.

**New files**
- `azure-functions/src/lib/inboundParsing.js` — pure: `parseTicketId(subject)`,
  `isAutoReply(message)`, `htmlToText(s)` (uniqueBody fallback). Unit-tested.
- `azure-functions/src/functions/pollInboundReplies.js` — the timer handler.
- `azure-functions/test/inboundParsing.test.js` — `node:test` suite.

**Modified**
- `azure-functions/src/lib/emailTemplates.js` — add `commentEmail(...)`.
- `azure-functions/src/lib/graphHelpers.js` — reuse `config`, `getGraphClient`, `sendMail`.

## Data flow (per poll)

```
timer (~2 min)
  └─ GET /users/{SENDER_EMAIL}/mailFolders/inbox/messages
        ?$filter=isRead eq false &$top=25
        &$select=id,subject,from,sentDateTime,uniqueBody,internetMessageHeaders
        (Prefer: outlook.body-content-type="text"  -> uniqueBody as plain text)
  └─ for each message (independent try/catch):
       1. isAutoReply(msg) or from == SENDER_EMAIL  -> mark read, skip
       2. tid = parseTicketId(subject)              -> no match: leave unread, skip
       3. GET /users/{from}  (404 => not directory) -> leave unread, skip
       4. GET ticket item {tid}                     -> 404: mark read (stale), skip
       5. body = uniqueBody text (trimmed)          -> empty: leave unread, skip
       6. POST comment: TicketID=tid, Body=body, IsInternal=false,
          OriginalAuthor="<name> <email>", OriginalCreated=sentDateTime
       7. logActivity(comment_added, channel:"email")
       8. notify participants (resolveDecisionRecipients(ticketFields, [], senderEmail))
          with commentEmail(...)  -> closes the email thread
       9. PATCH message isRead=true
```

## Mark-read policy

- **Mark read:** successful comment created · auto-reply · self-sent · stale ticket ref.
- **Leave unread (human triage):** no `Ticket #id` in subject · sender not a directory
  user · empty reply body. (Re-scanned each cycle but cheaply skipped; volume is low.)

## Attribution

App-only writes make `createdBy` the service principal, so the sender is captured in
**`OriginalAuthor`** (the field migrated comments already use to display an author) +
`OriginalCreated`. A `"— replied via email"` prefix on the body is a visible fallback if
the UI doesn't surface `OriginalAuthor` for these.

## Error handling

- Per-message `try/catch`: one malformed message never blocks the batch; on error the
  message is **left unread** to retry next cycle.
- Missing `Mail.ReadWrite` → the inbox read 403s → logged once per cycle, no crash.

## Configuration

- Reuse `SENDER_EMAIL` (the `supportdesk@` mailbox) from existing app settings.
- New (optional) `INBOUND_POLL_DISABLED` env flag to kill-switch the timer if needed.
- Timer schedule: `0 */2 * * * *` (every 2 minutes).

## Testing

- **Unit (`node:test`):** `parseTicketId` ("RE: [Update] Ticket #230: x" → 230; "no id"
  → null; "#0" handling), `isAutoReply` (Auto-Submitted header, "Automatic reply:"
  subject, normal reply → false), `htmlToText` (tags stripped, entities decoded).
- **Manual E2E:** reply to a real ticket notification from a directory user → comment
  appears on the ticket attributed to the sender; other participants receive the comment
  email; the message is marked read. Reply with an OOO auto-reply → ignored (no loop).

## Future / not now
- Attachments on replies → ticket attachments.
- New-ticket-from-email (cold email to `supportdesk@` with no ticket id).
