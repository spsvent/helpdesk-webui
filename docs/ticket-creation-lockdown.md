# Ticket Creation Lockdown — Runbook

Blocks tickets being created directly in the SharePoint Tickets list (including
from the Microsoft Lists mobile app), which bypasses auto-assignment, approval
and every notification.

## Why permissions alone weren't enough

The SPA used to create list items with the **signed-in user's delegated token**.
SharePoint sees that and a row added in the Lists app as the same identity doing
the same operation, so no permission could allow one and deny the other — any
rule that blocked the bypass also broke the app.

Ticket **#607** ("Weed Abatement", 2026-08-21) is the case that prompted this: it
sat in New for five days with nobody notified. Its field signature — no
`SupportChannel`, no `OriginalAssignedTo`, and `Category: "Request"` with
`ApprovalStatus: "None"` (unreachable in code) — proves it was written straight
to the list.

The fix moves the *create* server-side so it runs app-only, which frees the list
to drop **Add Items** from everyone.

## What's already shipped (code)

| Change | File |
|---|---|
| Pure validation + field building + EasyAuth principal parsing (15 tests) | `azure-functions/src/lib/webTicketIntake.js` |
| `createUserTicket` function — `POST /api/tickets`, EasyAuth-protected | `azure-functions/src/functions/createUserTicket.js` |
| SPA routes creation through the function when configured | `src/lib/graphClient.ts` (`createTicketViaFunction`) |
| Function App scope for the bearer token | `src/lib/msalConfig.ts` (`functionApiScope`) |
| Form passes MSAL handles | `src/app/new/page.tsx` |
| `isCreatorElevated` reads `originalRequester` first | `src/lib/rbacService.ts` |
| Help page warning against filing via the Lists app | `src/app/help/page.tsx` |

**All of it is inert until the two env vars below are set** — with them unset the
SPA keeps writing directly via Graph, exactly as before. That's deliberate: ship
the code, verify, then switch.

### The `isCreatorElevated` fix — don't drop this

Tickets created app-only have the **app** as SharePoint's Author. The old code
read `ticket.createdBy?.email` first, so it would short-circuit to a non-admin
address and always return `false` — silently un-hiding admin-created tickets
from regular users via group sharing. It now prefers `originalRequester`, which
`createUserTicket` always stamps with the real submitter. This must go live
**with** the switch, not after.

## Cutover

### 1. Expose a scope on the AAD app

Azure Portal → App registrations → `06fcde50-24bf-4d53-838d-ecc035653d8f` →
**Expose an API**. Set the Application ID URI to `api://06fcde50-...` if unset,
then add scope `user_impersonation` (admin + user consent). Under **Authorized
client applications**, pre-authorize the same client ID so users aren't prompted
for a second consent.

### 2. Enable EasyAuth on the Function App

Function App `helpdesk-notify-func` → **Settings → Authentication** → Add
identity provider → Microsoft, using the existing app registration.

> **Set "Restrict access" to _Allow unauthenticated access_.** Requiring
> authentication app-wide would break every anonymous endpoint — `sendemail`,
> `sendteamsnotification`, the agent API — and take notifications down.
> `createUserTicket` enforces the principal itself and returns 401 without one.

### 3. Function App environment variables

| Variable | Value |
|---|---|
| `ADMIN_EMAILS` | Comma-separated admin addresses (fallback alongside the GM group) |
| `GENERAL_MANAGERS_GROUP_ID` | Should already be set — used to resolve admin status server-side |

`isAdmin` is resolved **server-side only**. A client-supplied flag would let
anyone auto-approve their own Request. Resolution failures fall back to
non-admin (Pending), which is recoverable; failing open would silently approve.

### 4. Frontend env vars (workflow file, not Azure Portal)

Edit `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml`:

```yaml
NEXT_PUBLIC_TICKET_CREATE_FUNCTION_URL: "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/tickets"
NEXT_PUBLIC_FUNCTION_API_SCOPE: "api://06fcde50-24bf-4d53-838d-ecc035653d8f/user_impersonation"
```

Commit and push to rebuild. These are baked in at **build time** — setting them
in the Azure Portal does nothing for a static export.

### 5. Verify BEFORE touching permissions

```bash
func azure functionapp list-functions helpdesk-notify-func   # expect 26 now (was 25)
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/tickets   # 204
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/tickets \
  -H 'Content-Type: application/json' -d '{}'                                              # 401
```

Then in the app: file one **Problem** and one **Request** ticket and confirm each
gets `SupportChannel: "Web Form"`, an assignee, the assignment email, and — for
the Request — `ApprovalStatus: Pending` plus the approval email. Confirm an
admin-filed Request comes back `Approved`.

### 6. Only then: remove Add Items

Tickets list → Settings → Permissions for this list → **Stop Inheriting
Permissions**, then create a permission level copied from **Contribute** with
**Add Items** unchecked, and assign it to the members group.

Keep **Add Items** on the **TicketComments** list — commenting still writes
there as the user.

Verify: the Lists mobile app should now refuse to create a row in Tickets, while
the web app still files normally.

## Rollback

Clear `NEXT_PUBLIC_TICKET_CREATE_FUNCTION_URL` and rebuild — the SPA reverts to
the direct Graph write. If Add Items was already removed, restore the members
group to stock **Contribute** first, or creation will fail on both paths.

## Open item — attachments

Attachment upload uses the SharePoint REST API as the signed-in user
(`uploadAttachment` in `src/lib/graphClient.ts`) against an item the app just
created. Adding an attachment to an *existing* item should be governed by Edit
Items rather than Add Items, but this was **not verified against a live list**.
Test one ticket with an attachment right after step 6; if it fails, grant the
custom level **Add Items** on the Tickets list's attachment store or revert to
Contribute while it's investigated.

## Known gap this does not close

Anyone with **Full Control / site owner** rights can still add list rows
directly. This raises the floor for ordinary staff; it isn't a hard boundary
against admins. A periodic sweep for tickets missing `SupportChannel` is the
backstop if that matters.
