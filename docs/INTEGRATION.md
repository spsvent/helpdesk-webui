# SkyPark Help Desk — Integration Reference

**Audience:** any agent, script, or service that wants to talk to the ticketing
system from outside the web app. This is the single source of truth for every
externally-reachable endpoint, webhook, credential, and data shape.

If you are *editing the SPA itself*, you also want `CLAUDE.md` (build/deploy rules)
and `README.md`. This document covers the **integration surface** only.

Machine-readable companion: [`openapi.yaml`](./openapi.yaml) — every HTTP endpoint
below, with schemas and auth schemes.

---

## 0. Ten-second orientation

| I want to… | Use |
|---|---|
| Read a ticket + its comment thread | `GET /api/agent/tickets/{id}` (`x-agent-key`) |
| List tickets | `GET /api/agent/tickets` (`x-agent-key`) |
| Post a reply / internal note | `POST /api/agent/tickets/{id}/comments` (`x-agent-key`) |
| Change status | `POST /api/agent/tickets/{id}/status` (`x-agent-key`) |
| **File a new ticket** (monitoring, scripts) | `POST /api/createticket?code=<host key>` |
| Wire up Uptime Kuma | Point a Kuma **webhook** notification at `POST /api/createticket?code=…` — no payload mapping needed |
| Do all of the above from a shell / MCP | `tools/helpdesk-agent/` (CLI + MCP server) |

> **Common misconception:** "the agent API has no create endpoint, so alerting has to
> be push-only / exit-code-based." Half true. The `x-agent-key` agent API has no
> create — but `CreateTicket` is a full-fidelity intake endpoint with a built-in
> Uptime Kuma adapter, dedupe, priority mapping, auto-assign, and auto-close. It just
> uses a different auth scheme (Azure Functions host key), which is why it isn't in
> the agent-API table. Use it.

---

## 1. Hosts and auth

### Base URLs

| Thing | URL |
|---|---|
| Web app (production) | `https://tickets.spsvent.net` |
| Web app (Azure default) | `https://lively-coast-062dfc51e.1.azurestaticapps.net` |
| Function App | `https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net` |
| SharePoint site | `https://skyparksv.sharepoint.com/sites/helpdesk` |

> ⚠️ The Function App is on a **Flex Consumption** plan. The hostname *must* include
> the unique id and region suffix. `helpdesk-notify-func.azurewebsites.net` does not
> resolve.

Deep links to a ticket are `https://tickets.spsvent.net/?ticket=<id>`, where `<id>`
is the SharePoint list item id — the same number every API below calls `id`.

### The three auth schemes

The Function App uses three distinct schemes. Knowing which one an endpoint wants is
most of the battle.

| Scheme | How you present it | Used by | Meaning |
|---|---|---|---|
| **Agent key** | `x-agent-key: <AGENT_API_KEY>` header | the 4 `/api/agent/*` endpoints | Generic read/write on any ticket. Compared with `crypto.timingSafeEqual`. If `AGENT_API_KEY` is unset server-side, the whole API returns **503 `agent_api_disabled`** — that is "not configured", not "wrong key". |
| **Host key** | `?code=<function or host key>` query param | `authLevel: "function"` endpoints — `CreateTicket`, `convertHeic`, the `send*ApprovalRequest` trio, and all four manual timer triggers | Standard Azure Functions key. Get one from the Portal (App keys) or `az functionapp keys list`. |
| **Signed token** | `?token=<token>` (GET) or `{"token": "…"}` (POST) | the 3 `*ApprovalAction` endpoints | HMAC-SHA256 one-click approve/deny links minted for a named approver. See §6. |

Genuinely anonymous (no auth at all): `SendEmail`, `SendTeamsNotification`,
`syncToTodo`, `syncToVikunja`. `vikunjaWebhook` is anonymous but signature-verified.
These are called by the browser SPA, which has no way to hold a secret.

### Client credentials

```bash
# ~/.config/helpdesk-agent/env  (0600)
HELPDESK_AGENT_KEY=<matches Function App AGENT_API_KEY>
HELPDESK_FUNCTION_KEY=<Azure Functions host key, needed only for `create`>
HELPDESK_AGENT_API_URL=https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api
HELPDESK_ACTOR="Claude (fedora-server)"
HELPDESK_ACTOR_EMAIL=agent@skyparksantasvillage.com
```

`HELPDESK_ACTOR` is the name recorded on comments and in the activity log.
`HELPDESK_ACTOR_EMAIL` opts you into self-notification suppression (§7).

---

## 2. Agent API — `/api/agent/*`

Four endpoints, all requiring `x-agent-key`. Every write produces the same activity
log entry and email fan-out a human action would, so agents are first-class actors
rather than silent back-door writers.

Source: `azure-functions/src/functions/agentApi.js`

### `GET /api/agent/tickets/{id}`

Returns the ticket's full SharePoint field bag plus the whole comment thread,
oldest-first.

```json
{
  "ticket": { "id": "582", "Title": "…", "Status": "New", "Priority": "High",
              "ProblemType": "Tech", "TicketNumber": 582, "Description": "…",
              "RequesterEmail": "…", "ParticipantEmails": "a@x;b@y", "…": "…" },
  "comments": [
    { "id": "1201", "author": "Jane Doe", "authorEmail": "jane@…",
      "body": "…", "isInternal": false, "created": "2026-08-20T17:02:11Z" }
  ]
}
```

`ticket` is the raw `fields` object — every column on the Tickets list (§8), not a
curated subset. `RequesterEmail` is synthesised from the item's `createdBy`.

Errors: `404 ticket_not_found`, `401 unauthorized`, `503 agent_api_disabled`.

### `GET /api/agent/tickets?status=&top=`

| Param | Default | Notes |
|---|---|---|
| `status` | none (all) | Exact match on one of the five statuses |
| `top` | 50 | Capped at 200 |

Returns a **summary** projection, newest-modified first:

```json
{ "tickets": [ { "id": "582", "ticketNumber": 582, "title": "…", "status": "New",
                 "priority": "High", "problemType": "Tech", "assignedTo": "Jane Doe",
                 "created": "…", "modified": "…" } ] }
```

Implementation note: SharePoint rejects `orderby` on non-indexed columns for large
lists. The handler retries unordered and sorts in memory, so ordering is always
honoured but may cost an extra round trip.

### `POST /api/agent/tickets/{id}/comments`

```json
{ "text": "Fixed the DNS entry; please confirm.",
  "isInternal": false, "notify": true,
  "actorLabel": "Claude (fedora-server)", "actorEmail": "agent@…" }
```

| Field | Required | Default | Effect |
|---|---|---|---|
| `text` | ✅ | — | Comment body. Empty/whitespace → `400 missing_text`. |
| `isInternal` | | `false` | Staff-only. **Internal comments never email anyone**, regardless of `notify`. |
| `notify` | | `true` | `false` suppresses email on a public comment. |
| `actorLabel` | | `"Automation Agent"` | Shown as the comment author and in the activity log. |
| `actorEmail` | | `""` | Enables self-notification suppression for that address. |

Public comments email the requester + participants + prior public commenters, with
opt-out and self-suppression applied. Response echoes who was actually mailed:

```json
{ "ok": true, "ticketId": "582", "isInternal": false,
  "notified": ["requester@…", "participant@…"] }
```

### `POST|PATCH /api/agent/tickets/{id}/status`

```json
{ "status": "Resolved", "note": "Fixed by restarting the service",
  "notify": true, "actorLabel": "…", "actorEmail": "…" }
```

Valid statuses — **exactly these five**, case-sensitive:
`New` · `In Progress` · `On Hold` · `Resolved` · `Closed`
(anything else → `400 invalid_status` with the valid list in the body).

`note`, if present, is recorded as an **internal** comment alongside the change.

Setting the status to its current value is a no-op that returns
`{ "ok": true, "unchanged": true }` — no email, no log entry. Safe to call
idempotently.

```json
{ "ok": true, "ticketId": "582", "oldStatus": "New", "status": "Resolved",
  "notified": ["requester@…"] }
```

> **Note:** `Cancelled` is treated as a closed status by the intake deduper but is
> **not** settable through this endpoint. The five above are the whole set.

---

## 3. Ticket intake — `POST /api/createticket`

**This is the create endpoint.** Auth: `?code=<host key>` (`authLevel: "function"`).

Source: `azure-functions/src/functions/createTicket.js`

Machine-to-machine intake for monitoring systems, internal apps, and scripts. It
creates a *full-fidelity* ticket app-only: auto-assigns using the same
AutoAssignRules the web form uses, emails the assignee, writes an ActivityLog entry,
and dedupes flapping alerts.

### Request

```json
{
  "title": "Payment terminal offline",
  "description": "POS-3 has not checked in for 10 minutes.",
  "problemType": "Tech",
  "priority": "High",
  "location": "Main Lodge",
  "problemTypeSub": "POS",
  "problemTypeSub2": "Terminal",
  "requesterEmail": "ops@skyparksantasvillage.com",
  "assigneeEmail": "jnunn@skyparksantasvillage.com",
  "source": "nagios",
  "externalRef": "pos3-offline",
  "category": "Problem"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `title` | ✅ | — | |
| `description` | ✅ | — | |
| `problemType` | ✅ | — | Department. Must be one of the 13 in §8.1. |
| `category` | | `"Problem"` | **Must be `"Problem"`.** Request tickets need the GM approval flow (token mint + approver email) and are not supported by the API yet. |
| `priority` | | `"Normal"` | `Low` · `Normal` · `High` · `Urgent` |
| `problemTypeSub`, `problemTypeSub2` | | — | Sub-category; see `src/lib/categoryConfig.ts` |
| `location` | | — | |
| `requesterEmail` | | — | Resolved to a SharePoint site-user id so the Requester person field populates. Unresolvable addresses still land in `OriginalRequester`. |
| `assigneeEmail` | | auto | Explicit override; otherwise AutoAssignRules decide. Any lookup failure → unassigned, never a hard error. |
| `source` | | — | Free text. Stored as `SupportChannel: "API: <source>"`. |
| `externalRef` | | — | **Dedup key.** See below. |

### Responses

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ ok: true, id, ticketNumber, url }` | Created |
| `200` | `{ ok: true, deduped: true, commentThrottled, id, ticketNumber, url }` | Folded onto an existing open ticket |
| `200` | `{ ok: true, skipped: true, reason }` | Kuma event that isn't DOWN |
| `400` | `{ ok: false, error: "validation failed", details: [...] }` | |
| `500` | `{ ok: false, error: "server not configured" }` | `SHAREPOINT_SITE_ID`/`TICKETS_LIST_ID` unset |
| `502` | `{ ok: false, error: "graph auth failed" \| "ticket create failed" }` | |

### Dedupe semantics — read this before wiring up alerting

If you send an `externalRef` and an **open** ticket already carries it, you get no
second ticket. Instead the API appends a comment prefixed `Repeat alert` and returns
`deduped: true` with the existing ticket's id.

- "Open" = any status except `Resolved`, `Closed`, `Cancelled`. Once a human closes
  the ticket, the next alert with the same ref opens a fresh one.
- Repeat comments are throttled to at most one per `API_REPEAT_COMMENT_THROTTLE_MINUTES`
  (default **30**) per ticket. `commentThrottled: true` means the alert was counted
  but not commented. Set the var to `0` to comment on every repeat.
- **Pick a stable `externalRef` per alert condition** (e.g. `pos3-offline`, not one
  containing a timestamp). A ref that changes per event defeats dedupe entirely and
  will bury the queue.

---

## 4. Uptime Kuma integration

`CreateTicket` natively understands Uptime Kuma's own webhook body — you do **not**
write an adapter, a script, or a payload template.

Source: `azure-functions/src/lib/kumaAdapter.js`, `kumaRecovery.js`,
`azure-functions/src/functions/autoCloseRecovered.js`

### Setup

Kuma → Settings → Notifications → Setup Notification:

- **Notification Type:** Webhook
- **Post URL:** `https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/createticket?code=<host key>`
- **Request Body:** *Preset — application/json* (Kuma's native `{heartbeat, monitor, msg}`)

Then attach the notification to each monitor. That's the whole integration.

### Behaviour

| Kuma `heartbeat.status` | Meaning | What happens |
|---|---|---|
| `0` DOWN | Down | Creates a ticket, or comments on the existing one for that monitor |
| `1` UP | Recovered | Stamps `ExternalRecoveredAt`; no ticket, no email |
| `2` PENDING / `3` MAINTENANCE | — | Acked `200`, nothing created |

- **Dedup key** is `kuma-<monitor.id>` (falls back to `kuma-<monitor.name>` if Kuma
  omits the id), so a flapping monitor collapses onto one ticket.
- A fresh DOWN **clears** any recovery stamp, so the auto-close clock can't fire
  mid-outage.
- Generated ticket: `title` = `"<monitor> is DOWN"`, `problemType` = `Tech`,
  `source` = `uptime-kuma`, description includes hostname/URL and Kuma's message.

### Priority comes from Kuma monitor tags

| Tag on the monitor | Ticket priority |
|---|---|
| `Critical` | Urgent |
| `Important` | High |
| `Moderate` | Normal |
| *(untagged)* | Normal |

Most severe tag wins. Tag names are case-sensitive.

### Auto-close

`autoCloseRecovered` runs hourly. It closes a Kuma ticket only when **all** hold:

1. `ExternalRef` starts with `kuma-`
2. Status is still exactly `New` (nobody picked it up)
3. `ExternalRecoveredAt` is set and has held for `KUMA_AUTO_CLOSE_MINUTES` (default **60**)
4. No human has commented (only `OriginalAuthor: "API"` comments present)

Nobody is emailed on auto-close — a monitor that fixed itself unobserved shouldn't
generate a second round of noise. The closing comment and ActivityLog entry are the
record. Set `KUMA_AUTO_CLOSE_MINUTES=0` to disable the sweep entirely.

Manual trigger: `POST /api/runautocloserecovered?code=<host key>`.

---

## 5. Agent tooling — CLI and MCP

`tools/helpdesk-agent/` — dependency-free, Node ≥ 18. Wraps everything above so
agents don't hand-roll HTTP.

| File | Purpose |
|---|---|
| `helpdesk-client.mjs` | Shared client. Parses ids/URLs, calls the endpoints. |
| `helpdesk.mjs` | CLI — Bash, cron, any script |
| `mcp-server.mjs` | Stdio MCP server exposing the same operations as typed tools |

Every ticket argument accepts a bare id (`582`), `#582`, or a full
`https://tickets.spsvent.net?ticket=582` URL.

### CLI

```bash
helpdesk get 582
helpdesk get "https://tickets.spsvent.net?ticket=582"
helpdesk list --status "In Progress" --top 20
helpdesk comment 582 "Fixed the DNS entry; please confirm."
helpdesk comment 582 "root cause: stale cache" --internal
helpdesk status 582 Resolved --note "Fixed by restarting the service"
helpdesk create "POS-3 offline" "No check-in for 10 min" \
  --type Tech --priority High --ref pos3-offline --source nagios
```

`create` requires `HELPDESK_FUNCTION_KEY` (host key) in addition to the agent key,
because it targets `CreateTicket` rather than the agent API. Every command exits
non-zero on failure, so `set -e` scripts and cron behave.

### MCP tools

`get_ticket` · `list_tickets` · `add_comment` · `set_ticket_status` ·
`create_ticket` · `get_integration_docs`

`get_integration_docs` returns this document, so an agent connected to the MCP
server can read the full integration reference without a repo checkout.

On the FedoraServer these are reached through the `skypark` LiteLLM gateway with a
`helpdesk-` prefix (`helpdesk-get_ticket`, …). Registering the standalone server
directly gives unprefixed names. See the machine-wide notes in `~/.claude/CLAUDE.md`.

---

## 6. Email-first approvals (signed-token endpoints)

Three parallel workflows, each a mint endpoint (host-key) + an action endpoint
(token). The action endpoints are anonymous by necessity — they're clicked straight
from an email client.

| Workflow | Mint (host key) | Act (token) | Entity |
|---|---|---|---|
| Ticket approval | `POST /api/sendapprovalrequest` `{ticketId, requesterName}` | `/api/approvalaction` | Tickets list |
| Purchase approval | `POST /api/sendpurchaseapprovalrequest` `{purchaseId, requesterName}` | `/api/purchaseapprovalaction` | PurchaseRequests list |
| CDW approval | `POST /api/sendcdwapprovalrequest` `{cdwId, requesterName}` | `/api/cdwapprovalaction` | CDW list |

### Token format

`base64url(JSON payload).base64url(HMAC-SHA256)`, signed with `APPROVAL_LINK_SECRET`.

Payload: `{ tid, action, email, name, iat, exp, jti }`. TTL **14 days**.
`action` is one of `approve` · `deny` · `changes` → `Approved` · `Denied` ·
`Changes Requested`. Signature comparison is `timingSafeEqual`.

### Action endpoint contract

- `GET  /api/<x>approvalaction?token=…` — returns the decision preview (used to
  render the confirmation page); does not commit.
- `POST /api/<x>approvalaction` with `{ token, note }` — commits the decision.

| Failure | Status | `reason` |
|---|---|---|
| Bad/expired/garbled token | 400 | `malformed` · `bad_signature` · `expired` |
| Token minted for a different entity type | 400 | `wrong_entity` |
| Unknown action | 400 | `bad_action` |
| `changes` without a note | 400 | `note_required` |
| Already decided by someone else | 409 | `decisionConflict` payload |
| ETag race on write | 409 | `conflict_retry` |

Decisions use **optimistic concurrency** on the item ETag, so two approvers clicking
at once produce one decision and one 409, not a silent last-write-wins.

---

## 7. Notification rules (apply to every send path)

Three independent suppression layers. Any new notification path inherits all of them
via the shared chokepoints — **do not re-implement per call site**.

### 7.1 Self-notification suppression

Nobody is emailed about a change they made themselves.

| Side | Chokepoint | Mechanism |
|---|---|---|
| Frontend | `src/lib/graphClient.ts` → `sendEmail` | `actorEmail` defaults to `getCurrentActor()`. Recipient == actor → skipped. Pass `""` to force a deliberate self-email. |
| Functions | `graphHelpers.sendMail(…, {actorEmail})`, `SendEmail`'s `actorEmail` body field | `src/lib/selfNotify.js` — `isSelfNotification` / `excludeActor` / `excludeActorMembers` |

**Deliberate limit:** matching is by individual address only. Mail to a shared/M365
group address still reaches every member including the actor — Graph has no
per-recipient suppression, and expanding the group into N sends would break the
shared queue's reply semantics.

The three approval-request functions drop the requester from the expanded GM group;
if that empties the list they return `{ note: "self_only" }` and send nothing — the
item is still Pending in the app.

### 7.2 Recipient opt-out

Addresses on the **NotificationOptOut** list are dropped by every server-side send
path (`graphHelpers.sendMail`, the `SendEmail` HTTP function, `checkEscalations`).
Opted-out people keep all access and roles; only delivery stops. Managed from
Settings → Notification Opt-Out. Requires `NOTIFICATION_OPTOUT_LIST_ID` on the
Function App; unset disables suppression.

### 7.3 Internal comments

`isInternal: true` never emails anyone, on any path, regardless of `notify`.

### Who gets a public comment / status change

`resolveDecisionRecipients(fields, commenterEmails, actorEmail)` — the requester,
plus `ParticipantEmails`, plus every prior **public** commenter, minus the actor,
minus opt-outs, deduped.

---

## 8. Data model (SharePoint)

Site: `https://skyparksv.sharepoint.com/sites/helpdesk`. All access is Graph API
against list GUIDs supplied by env vars.

> **Never write to the Tickets/Comments lists via raw Graph from an agent.** That
> bypasses notifications and the activity log. Use the agent API or `CreateTicket`.

| List | Function env var | Frontend env var | Holds |
|---|---|---|---|
| Tickets | `TICKETS_LIST_ID` | `NEXT_PUBLIC_TICKETS_LIST_ID` | The tickets |
| TicketComments | `COMMENTS_LIST_ID` | `NEXT_PUBLIC_COMMENTS_LIST_ID` | Comment thread |
| ActivityLog | `ACTIVITY_LOG_LIST_ID` | `NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID` | Audit trail |
| AutoAssignRules | `AUTO_ASSIGN_LIST_ID` | `NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID` | Routing rules |
| EscalationRules | `ESCALATION_LIST_ID` | `NEXT_PUBLIC_ESCALATION_LIST_ID` | Escalation rules |
| RBACGroups | — | `NEXT_PUBLIC_RBAC_GROUPS_LIST_ID` | Entra group → role map |
| NotificationOptOut | `NOTIFICATION_OPTOUT_LIST_ID` | `NEXT_PUBLIC_NOTIFICATION_OPTOUT_LIST_ID` | Suppressed addresses |
| TeamsChannels | — | `NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID` | Teams notification targets |
| PurchaseRequests | `PURCHASE_LIST_ID` | `NEXT_PUBLIC_PURCHASE_LIST_ID` | Purchase module |
| CDW | `CDW_LIST_ID` | `NEXT_PUBLIC_CDW_LIST_ID` | CDW module |
| OrderCatalog | — | `NEXT_PUBLIC_ORDER_CATALOG_LIST_ID` | Recurring order sheets |
| VisibilityKeywords | — | `NEXT_PUBLIC_VISIBILITY_KEYWORDS_LIST_ID` | Keyword-based visibility |
| TodoSyncMap | `TODO_SYNC_MAP_LIST_ID` | — | ticket → To Do task id |
| VikunjaSyncMap | `VIKUNJA_SYNC_MAP_LIST_ID` | — | ticket → Vikunja task id |

### 8.1 Enumerations

**Departments (`ProblemType`)** — 13, validated on intake. Canonical source is
`src/lib/categoryConfig.ts` (`CATEGORY_HIERARCHY` keys); `ticketIntake.js` mirrors it
and **must be kept in sync**:

`Tech` · `Operations` · `Facilities` · `Marketing` · `HR` · `Customer Service` ·
`Inventory` · `Finance` · `Food & Beverage` · `Campground` · `Retail` · `Safety` ·
`Other`

Sub-categories (`ProblemTypeSub`, `ProblemTypeSub2`) are a two-level hierarchy per
department — see `CATEGORY_HIERARCHY`.

| Enum | Values |
|---|---|
| `Status` | `New` · `In Progress` · `On Hold` · `Resolved` · `Closed` |
| `Priority` | `Low` · `Normal` · `High` · `Urgent` |
| `Category` | `Request` · `Problem` (API accepts `Problem` only) |
| `ApprovalStatus` | `None` · `Pending` · `Approved` · `Denied` · `Changes Requested` |
| `PurchaseStatus` | `Pending Approval` · `Approved` · `Approved with Changes` · `Ordered` · `Purchased` · `Received` · `Denied` |
| RBAC roles | `admin` · `support` · `user`, plus `purchaser` / `inventory` group types |

### 8.2 Tickets list — fields you'll actually touch

`Title` · `Description` · `Category` · `Priority` · `Status` · `ProblemType` ·
`ProblemTypeSub` · `ProblemTypeSub2` · `Location` · `TicketNumber` · `DueDate` ·
`AssignedTo` (person) · `Requester` (person, via `RequesterLookupId`) ·
`OriginalRequester` / `OriginalAssignedTo` (email strings, used for migrated and
API-created tickets) · `ParticipantEmails` (`;`/`,`-separated) · `SupportChannel` ·
`ExternalRef` · `ExternalRecoveredAt` · `ApprovalStatus` · `ApprovalDate` ·
`ApprovedByName` / `ApprovedByEmail` · `ApprovalNotes` · `ApprovalRequestedDate` ·
`ApprovalRequestedByName` / `ApprovalRequestedByEmail`

Mapping helper: `mapToTicket()` in `src/types/ticket.ts`. The requester's email
always comes from the item's `createdBy`, not a column.

> The Tickets list still carries legacy purchase columns. They are a migration
> rollback backup — the app no longer reads or writes them. Purchase data lives in
> the **PurchaseRequests** list.

### 8.3 TicketComments — fields

`Title` (first 50 chars, auto) · `TicketID` (number, links to the ticket item id) ·
`Body` (**the live column**) · `IsInternal` · `CommentType` · `OriginalAuthor` ·
`OriginalCreated`

`mapToComment()` also tolerates a legacy `CommentBody` column and the old
`CommentType` values `Reply` / `Private note`. Write `Body`.

`OriginalAuthor` doubles as the "who acted" signal: `"API"` means machine-generated
(the Kuma auto-close sweep uses this to detect human engagement), anything else is a
person or a labelled agent.

### 8.4 ActivityLog — fields

`Title` (description) · `EventType` · `TicketId` · `TicketNumber` · `Actor` ·
`ActorName` · `Details` (JSON string)

Agent-API writes set `EventType` to `comment_added` / `ticket_status_changed` and
`Details.channel` to `agent_api`. Intake writes `EventType: "Created"` with
`Actor` = your `source`.

### 8.5 EscalationRules — fields

`Title` · `IsActive` · `SortOrder` · `TriggerType` · `TriggerHours` ·
`MatchDepartment` · `MatchPriority` · `MatchStatus` · `ActionType` ·
`EscalateToPriority` · `ReassignToEmail` · `NotifyEmail`

---

## 9. Complete endpoint inventory

**25 functions: 21 HTTP + 4 timer.** After any deploy, `func azure functionapp
list-functions helpdesk-notify-func` must show 25. A short list means a broken
deploy — see §11.

### HTTP (21)

| Function | Route | Methods | Auth | Purpose |
|---|---|---|---|---|
| `agentGetTicket` | `/api/agent/tickets/{id}` | GET | agent key | Ticket + thread |
| `agentListTickets` | `/api/agent/tickets` | GET | agent key | Summary list |
| `agentAddComment` | `/api/agent/tickets/{id}/comments` | POST | agent key | Comment |
| `agentSetStatus` | `/api/agent/tickets/{id}/status` | POST, PATCH | agent key | Status |
| `CreateTicket` | `/api/createticket` | POST | host key | **Ticket intake** (+ Kuma) |
| `SendEmail` | `/api/sendemail` | POST, OPTIONS | anonymous | Send mail via Graph |
| `SendTeamsNotification` | `/api/sendteamsnotification` | POST, OPTIONS | anonymous | Post Adaptive Card to a channel |
| `convertHeic` | `/api/convertheic` | POST, OPTIONS | host key | HEIC → JPEG bytes |
| `syncToTodo` | `/api/synctotodo` | POST, OPTIONS | anonymous | Mirror to Microsoft To Do |
| `syncToVikunja` | `/api/synctovikunja` | POST, OPTIONS | anonymous | Mirror to Vikunja |
| `vikunjaWebhook` | `/api/vikunjawebhook` | POST, OPTIONS | HMAC signature | Vikunja → Help Desk |
| `sendApprovalRequest` | `/api/sendapprovalrequest` | POST, OPTIONS | host key | Mint ticket approval mail |
| `sendPurchaseApprovalRequest` | `/api/sendpurchaseapprovalrequest` | POST, OPTIONS | host key | Mint purchase approval mail |
| `sendCdwApprovalRequest` | `/api/sendcdwapprovalrequest` | POST, OPTIONS | host key | Mint CDW approval mail |
| `approvalAction` | `/api/approvalaction` | GET, POST, OPTIONS | token | Commit ticket decision |
| `purchaseApprovalAction` | `/api/purchaseapprovalaction` | GET, POST, OPTIONS | token | Commit purchase decision |
| `cdwApprovalAction` | `/api/cdwapprovalaction` | GET, POST, OPTIONS | token | Commit CDW decision |
| `runEscalationCheck` | `/api/runescalationcheck` | GET, POST | host key | Manual escalation sweep |
| `runAutoCloseRecovered` | `/api/runautocloserecovered` | GET, POST | host key | Manual Kuma auto-close sweep |
| `runInboundPoll` | `/api/runinboundpoll` | GET, POST | host key | Manual inbound mail poll |
| `runPurchaseReminders` | `/api/runpurchasereminders` | GET, POST | host key | Manual purchase reminders |

### Timers (4)

| Function | Cron | Does | Kill switch |
|---|---|---|---|
| `checkEscalations` | `0 0 * * * *` (hourly) | Applies EscalationRules — bump priority, reassign, notify | rule `IsActive` |
| `autoCloseRecovered` | `0 0 * * * *` (hourly) | Closes recovered Kuma tickets (§4) | `KUMA_AUTO_CLOSE_MINUTES=0` |
| `pollInboundReplies` | `0 */2 * * * *` (2 min) | Reads the support mailbox, turns replies into comments | `INBOUND_POLL_DISABLED` |
| `purchaseReminders` | `0 0 16 * * *` (daily 16:00 UTC) | Nudges on stale purchase requests | — |

> ⚠️ **Timers fail silently on a broken deploy.** Nothing 404s visibly; the scheduled
> work just never runs. Always verify the function *list*, not one endpoint.

### 9.1 Inbound email → comment

`pollInboundReplies` polls the `SENDER_EMAIL` mailbox every 2 minutes.

- Ticket id is recovered from the subject via `/Ticket #(\d+)/i`. Every outbound
  subject contains `Ticket #<id>`, and mail clients preserve it on reply. **Never
  strip it from an email template.**
- Auto-replies and OOO are detected (`Automatic reply:` / `Auto:` / `out of office`
  subjects, plus `internetMessageHeaders`) and dropped so re-notification can't loop.
- The reply lands as a public comment authored by the sender and re-notifies the
  other participants.

> Graph rejects standard threading headers like `In-Reply-To` ("header name should
> start with 'x-'"), which is why threading is subject-based.

### 9.2 Task-manager sync

Both are one-directional pushes from the SPA (`POST {eventType, ticketId, …}`),
except the Vikunja webhook which comes back the other way.

| | To Do | Vikunja |
|---|---|---|
| Endpoint | `/api/synctotodo` | `/api/synctovikunja` |
| `eventType` values | `ticket_created` · `ticket_updated` · `ticket_recategorized` | `ticket_created` · `ticket_updated` · `ticket_resolved` · `ticket_recategorized` · `comment_added` |
| Scope | `ProblemType == "Tech"` **and** assigned | `VIKUNJA_PROJECT_ID` |
| Frontend flag | `NEXT_PUBLIC_TODO_SYNC_ENABLED` | `NEXT_PUBLIC_VIKUNJA_SYNC_ENABLED` |
| Map list | `TodoSyncMap` | `VikunjaSyncMap` |
| Reverse sync | none | `vikunjaWebhook` (`task.updated`, `task.comment.created`) |

`vikunjaWebhook` verifies an HMAC signature (`X-Vikunja-Signature` /
`VIKUNJA_WEBHOOK_SECRET`) and skips cleanly with
`{success: true, action: "skipped", reason: "no_task_id" | "no_mapping" | "sync_paused"}`
rather than erroring.

---

## 10. Environment variables

### 10.1 Function App

Set in **Azure Portal → Function Apps → helpdesk-notify-func → Settings →
Environment variables**. These are runtime values; changing one restarts the app.

| Group | Vars |
|---|---|
| Graph auth | `AZURE_CLIENT_ID` · `AZURE_CLIENT_SECRET` · `AZURE_TENANT_ID` · `SENDER_EMAIL` |
| SharePoint | `SHAREPOINT_SITE_ID` · `TICKETS_LIST_ID` · `COMMENTS_LIST_ID` · `ACTIVITY_LOG_LIST_ID` · `AUTO_ASSIGN_LIST_ID` · `ESCALATION_LIST_ID` · `NOTIFICATION_OPTOUT_LIST_ID` · `PURCHASE_LIST_ID` · `CDW_LIST_ID` |
| Entra groups | `GENERAL_MANAGERS_GROUP_ID` · `PURCHASER_GROUP_ID` · `INVENTORY_GROUP_ID` |
| Agent API | `AGENT_API_KEY` (unset ⇒ API disabled, 503) |
| Intake | `API_REPEAT_COMMENT_THROTTLE_MINUTES` (default 30) |
| Kuma | `KUMA_AUTO_CLOSE_MINUTES` (default 60; `0` disables) |
| Approvals | `APPROVAL_LINK_SECRET` |
| Teams bot | `BOT_APP_ID` · `BOT_APP_SECRET` |
| Inbound mail | `INBOUND_POLL_DISABLED` |
| To Do | `TODO_TARGET_USER` · `TODO_SYNC_MAP_LIST_ID` · `TODO_LIST_NAME` · `TODO_LIST_ID` |
| Vikunja | `VIKUNJA_BASE_URL` · `VIKUNJA_API_TOKEN` · `VIKUNJA_PROJECT_ID` · `VIKUNJA_SYNC_MAP_LIST_ID` · `VIKUNJA_WEBHOOK_SECRET` |
| Misc | `APP_URL` · `APPLICATIONINSIGHTS_CONNECTION_STRING` |

### 10.2 Frontend

> ⚠️ `NEXT_PUBLIC_*` are **baked in at build time**. Setting them in the Azure Portal
> does nothing — this is a static export with no server. Edit
> `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml` and push.

39 variables, defined in that workflow's `env:` block. Groups: Azure AD
(`CLIENT_ID`, `TENANT_ID`), SharePoint site + 12 list ids, 4 Entra group ids, 12
Function URLs (each carrying its `?code=` where the target needs a host key), feature
flags (`TEAMS_NOTIFICATIONS_ENABLED`, `TEAMS_NAA_ENABLED`, `TODO_SYNC_ENABLED`,
`VIKUNJA_SYNC_ENABLED`), and `APPINSIGHTS_CONNECTION_STRING` (from a GitHub Secret).

> **Known gap:** `NEXT_PUBLIC_ADMIN_EMAILS` is read by `src/lib/rbacConfig.ts` as the
> fallback admin list but is **not** defined in the workflow, so it is always empty in
> production. Admin access therefore depends entirely on
> `NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID` resolving. Add it to the workflow if you
> need the fallback to work.

### 10.3 Azure AD app permissions

App id `06fcde50-24bf-4d53-838d-ecc035653d8f`. **Application** permissions (not
delegated) with admin consent:

| Permission | For |
|---|---|
| `Mail.Send` | Sending from the shared mailbox |
| `Mail.ReadWrite` | Reading the mailbox + marking messages read for inbound reply polling. (Required by `pollInboundReplies`, which PATCHes `isRead`; not listed in the original setup docs — verify it's consented if inbound replies stop landing.) |
| `Sites.ReadWrite.All` | SharePoint lists |
| `User.Read.All` | User lookups, group expansion |
| `Tasks.ReadWrite.All` | To Do sync. ⚠️ Tenant-wide — To Do has no per-mailbox scoping, so this grants read/write to **all** users' tasks. |

---

## 11. Operating notes

### Deploying function changes

Pushing to `main` triggers the **Deploy Azure Functions** workflow, which ships
`azure-functions/`. Manual publish is the fallback:

```bash
cd azure-functions
func azure functionapp publish helpdesk-notify-func --javascript --build remote
```

> ⚠️ **`--build remote` is mandatory — omitting it takes the whole app down.** There
> is no `node_modules` in the repo, so a default publish uploads ~100 KB of source
> with `remotebuild = false`, Kudu skips the Oryx build, and the app comes up with
> **zero functions registered**. Every endpoint 404s and all notification email stops.
> The deploy still prints "The deployment was successful!" — trust the function list,
> not the success message. `--javascript` is also required (no `local.settings.json`
> to infer the worker runtime from).

Verify:

```bash
func azure functionapp list-functions helpdesk-notify-func   # expect 25
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/sendemail
# expect 204; 404 = no functions loaded
```

### Smoke tests

```bash
BASE=https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net

# Agent API reachable and keyed correctly
curl -s -H "x-agent-key: $HELPDESK_AGENT_KEY" "$BASE/api/agent/tickets?top=1"

# Intake validation (no ticket created — deliberately invalid)
curl -s -X POST "$BASE/api/createticket?code=$HELPDESK_FUNCTION_KEY" \
  -H "Content-Type: application/json" -d '{}'
# → 400 {"ok":false,"error":"validation failed","details":[...]}

# Simulated Kuma DOWN (this DOES create a ticket — use a throwaway monitor id)
curl -s -X POST "$BASE/api/createticket?code=$HELPDESK_FUNCTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"heartbeat":{"status":0,"msg":"timeout"},"monitor":{"id":9999,"name":"smoke-test","hostname":"example.invalid","tags":[{"name":"Moderate"}]},"msg":"down"}'
```

### Telemetry

One Application Insights resource (`helpdesk-insights`, RG `AppInsights`) serves
both tiers, separated by `cloud_RoleName`: `helpdesk-web` (browser) vs
`helpdesk-notify-func` (functions). Queries use Entra ID auth via `az login` — the
old `x-api-key` REST auth is deprecated as of March 2026.

```bash
az monitor app-insights query --app helpdesk-insights --resource-group AppInsights \
  --analytics-query "exceptions | where timestamp > ago(1h) | order by timestamp desc | take 20"
```

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `503 agent_api_disabled` | `AGENT_API_KEY` unset on the Function App | Set it in the Portal |
| `401 unauthorized` on `/api/agent/*` | Key mismatch | `HELPDESK_AGENT_KEY` must equal `AGENT_API_KEY` exactly |
| `401` on `CreateTicket` | Missing/wrong `?code=` | Use a host key, not the agent key |
| Every endpoint 404s | Deploy without `--build remote` | Republish correctly |
| DNS resolution failure | Short function-app hostname | Use the full Flex Consumption URL |
| Duplicate alert tickets | `externalRef` varies per event, or prior ticket was closed | Use a stable ref |
| Alerts create nothing | Kuma sending a *custom* body, not the JSON preset | Switch Request Body to the preset |
| Requester field blank | `EMail` not indexed in the User Information List | Already handled via `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly` |
| Teams "Bot not part of conversation roster" | App not installed in that Team | Install the Help Desk Teams app there |
| `"header name should start with 'x-'"` | Standard email headers rejected by Graph | Threading is subject-based; don't add `In-Reply-To` |

---

## 12. Known limits

Things you will otherwise discover the hard way:

1. **No create on the agent API.** `POST /api/agent/tickets` does not exist. Use
   `CreateTicket` (host key) or the CLI/MCP `create`.
2. **Intake is Problem-only.** `category: "Request"` is rejected — Request tickets
   need the GM approval flow (token mint + approver email), which only the web app
   drives.
3. **No delete, no reassign, no priority change** through any API. Status and
   comments are the whole agent write surface.
4. **No attachment upload API.** Attachments go through the SPA using the caller's
   own token.
5. **Self-suppression doesn't cover group addresses** (§7.1).
6. **`Cancelled` isn't settable** via the agent API, though the deduper treats it as
   closed.
7. **Sync is one-directional** for To Do (Help Desk → To Do only). Vikunja has a
   reverse webhook; To Do does not.
8. **`NEXT_PUBLIC_ADMIN_EMAILS` is never set in production** (§10.2).
9. **Departments are duplicated** in `src/lib/categoryConfig.ts` and
   `azure-functions/src/lib/ticketIntake.js`. Adding one means editing both, plus
   adding an AutoAssignRules row or the ticket lands unassigned.

---

## 13. Source map

| Concern | File |
|---|---|
| Agent API | `azure-functions/src/functions/agentApi.js` |
| Ticket intake + dedupe | `azure-functions/src/functions/createTicket.js`, `src/lib/ticketIntake.js` |
| Kuma adapter / auto-close | `azure-functions/src/lib/kumaAdapter.js`, `kumaRecovery.js`, `functions/autoCloseRecovered.js` |
| Auto-assignment | `azure-functions/src/lib/autoAssign.js`, `src/lib/autoAssignConfig.ts` |
| Approval tokens | `azure-functions/src/lib/approvalToken.js`, `decisionFields.js` |
| Recipient resolution | `azure-functions/src/lib/approvalRecipients.js` |
| Notification suppression | `azure-functions/src/lib/selfNotify.js`, `optOut.js`, `src/lib/currentActor.ts` |
| Graph auth + `sendMail` | `azure-functions/src/lib/graphHelpers.js` |
| Inbound mail parsing | `azure-functions/src/lib/inboundParsing.js` |
| Agent CLI / MCP | `tools/helpdesk-agent/` |
| Ticket/Comment shapes | `src/types/ticket.ts` |
| Departments | `src/lib/categoryConfig.ts` |
| RBAC | `src/types/rbac.ts`, `src/lib/rbacService.ts` |
| Frontend Graph client | `src/lib/graphClient.ts` |

---

*Keep this current: adding an endpoint, env var, enum value, or webhook means
updating this file and `openapi.yaml` in the same change.*
