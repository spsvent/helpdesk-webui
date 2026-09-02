# Claude Code Project Instructions

## ⇢ Integrating with the ticketing system? Start here

**[`docs/INTEGRATION.md`](docs/INTEGRATION.md)** is the single source of truth for the
entire external surface: all 25 Functions (21 HTTP + 4 timers), the three auth
schemes, the Uptime Kuma webhook, email-first approvals, notification suppression
rules, every SharePoint list and enum, and the known limits.
**[`docs/openapi.yaml`](docs/openapi.yaml)** is the machine-readable companion.

Read it before writing any code that calls, alerts, or automates the Help Desk —
it will save you from the usual wrong turns:

- The agent API (`x-agent-key`) has **no create endpoint**. Ticket creation is
  `POST /api/createticket`, gated by an Azure Functions **host key** (`?code=`).
- Uptime Kuma needs **no adapter** — `CreateTicket` parses Kuma's native webhook
  body, dedupes by monitor, maps tags to priority, and auto-closes on recovery.
- Notification suppression (self-notify, opt-out, internal comments) lives at
  shared chokepoints. Never re-implement it per call site.

Adding an endpoint, env var, enum value, or webhook? Update both files in the same
change.

## Project Overview

This is the SkyPark Help Desk web UI - a React/Next.js application for viewing and managing support tickets stored in SharePoint Online.

## Tech Stack

- React 18 + Next.js 14 (App Router, static export)
- Tailwind CSS for styling
- MSAL.js 2.0 for Azure AD authentication
- Microsoft Graph API for SharePoint access
- Azure Static Web Apps for hosting

## Key Directories

- `src/app/` - Next.js pages and routes
- `src/components/` - React components
- `src/lib/` - Configuration and API utilities
- `src/types/` - TypeScript interfaces

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
```

## IMPORTANT: Help Documentation Maintenance

**use the AskUserQuestionTool extensivly when creating plans**
**After completing any feature addition, bug fix, or UI change, you MUST update the Help page.**

### Help Page Location

The help documentation is located at: `src/app/help/page.tsx`

### When to Update Help

Update the help documentation when:

1. **New features are added** - Document how to use the new feature
2. **UI changes are made** - Update screenshots or descriptions if the interface changed
3. **New status/priority options** - Update the badge explanations
4. **Workflow changes** - Update any process documentation
5. **Bug fixes that change behavior** - Document the corrected behavior

### How to Update Help

1. Open `src/app/help/page.tsx`
2. Find the relevant `helpSections` entry or create a new one
3. Update the content with clear, step-by-step instructions
4. Include tips and notes where helpful
5. Test the Help page renders correctly

### Help Section Structure

Each help section has this structure:

```typescript
{
  id: "section-id",           // URL-friendly ID
  title: "Section Title",     // Displayed in sidebar and as heading
  content: (                  // JSX content
    <div className="space-y-4">
      {/* Section content */}
    </div>
  ),
}
```

### Writing Style Guidelines

- Use clear, simple language
- Include numbered steps for procedures
- Use bullet points for lists of items
- Add tip boxes (blue) for helpful hints
- Add warning boxes (yellow) for important notes
- Include visual indicators (badges, colors) where applicable

## Environment Variables

Required environment variables for local development (`.env.local`) and production (Azure):

### Core Configuration
- `NEXT_PUBLIC_CLIENT_ID` - Azure AD app client ID
- `NEXT_PUBLIC_TENANT_ID` - Azure AD tenant ID
- `NEXT_PUBLIC_SHAREPOINT_SITE_ID` - SharePoint site ID
- `NEXT_PUBLIC_SHAREPOINT_SITE_URL` - SharePoint site URL

### SharePoint List IDs
- `NEXT_PUBLIC_TICKETS_LIST_ID` - Tickets list
- `NEXT_PUBLIC_COMMENTS_LIST_ID` - TicketComments list
- `NEXT_PUBLIC_RBAC_GROUPS_LIST_ID` - RBACGroups list (role-based access control)
- `NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID` - AutoAssignRules list
- `NEXT_PUBLIC_ESCALATION_LIST_ID` - EscalationRules list
- `NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID` - ActivityLog list
- `NEXT_PUBLIC_NOTIFICATION_OPTOUT_LIST_ID` - NotificationOptOut list (emails suppressed from all notifications; access/roles unaffected). Also set `NOTIFICATION_OPTOUT_LIST_ID` on the Function App so server-side send paths enforce it.

### Teams Notifications
- `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED` - "true" to enable Teams notifications
- `NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID` - TeamsChannels SharePoint list ID
- `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE` - Only notify for tickets after this date (YYYY-MM-DD)

### Application Insights
- `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` - Application Insights connection string (via GitHub Secret `APPINSIGHTS_CONNECTION_STRING`)

### Other Configuration
- `NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID` - Entra ID group for admin access
- `NEXT_PUBLIC_ADMIN_EMAILS` - Comma-separated admin emails (fallback)
- `NEXT_PUBLIC_APP_URL` - Production app URL (for email links)
- `NEXT_PUBLIC_EMAIL_FUNCTION_URL` - Azure Function for sending emails
- `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` - Azure Function for escalation checks

### CRITICAL: Environment Variables for Production

**⚠️ IMPORTANT: This app uses Next.js static export. `NEXT_PUBLIC_*` variables are baked in at BUILD TIME, not runtime.**

#### Where to Set Environment Variables

| Variable Type | Where to Set | When Applied |
|---------------|--------------|--------------|
| `NEXT_PUBLIC_*` | GitHub Actions workflow file | Build time (baked into JS bundle) |
| Server-side / API | Azure Portal (won't work for this app) | Runtime |

#### Adding/Changing NEXT_PUBLIC_* Variables

**You MUST edit the GitHub Actions workflow file directly:**

1. Edit `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml`
2. Find the `env:` section under the "Build And Deploy" step
3. Add or modify the variable:
   ```yaml
   env:
     NEXT_PUBLIC_MY_NEW_VAR: "value"
   ```
4. Commit and push to trigger a rebuild:
   ```bash
   git add .github/workflows/*.yml
   git commit -m "Update environment variable NEXT_PUBLIC_MY_NEW_VAR"
   git push
   ```

#### Why Azure Portal Environment Variables Don't Work

Setting `NEXT_PUBLIC_*` variables in Azure Portal → Static Web Apps → Environment Variables **WILL NOT WORK** because:
- Azure Portal env vars are for **runtime** (server-side code)
- Next.js static export has **no server** - it's purely static HTML/JS/CSS
- `NEXT_PUBLIC_*` variables are replaced at build time by Next.js
- The build happens in GitHub Actions, which reads from the workflow file

#### Current Production Environment Variables

All `NEXT_PUBLIC_*` variables are defined in:
`.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml`

Key variables include:
- `NEXT_PUBLIC_EMAIL_FUNCTION_URL` - Azure Function for emails
- `NEXT_PUBLIC_TEAMS_FUNCTION_URL` - Azure Function for Teams bot notifications
- `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` - Azure Function for escalation checks
- `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` - Application Insights (from GitHub Secret)

#### Using GitHub Secrets (Optional)

For sensitive values, you can use GitHub Secrets:
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add a new repository secret
3. Reference in workflow: `${{ secrets.SECRET_NAME }}`

**Note:** Even with secrets, you still need to reference them in the workflow file.

## Deployment

Deployment is automatic via GitHub Actions on push to `main` branch.

Production URL: https://lively-coast-062dfc51e.1.azurestaticapps.net
Custom Domain: https://tickets.spsvent.net

## Azure Functions

The app uses Azure Functions for backend operations that require server-side credentials.

### Function App: `helpdesk-notify-func`

Location: `azure-functions/` directory in this repo

**Base URL:** `https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net`

> **⚠️ IMPORTANT:** This is a **Flex Consumption** plan function app. Flex Consumption apps use a different URL pattern that includes a unique identifier and regional suffix:
> - ❌ NOT: `helpdesk-notify-func.azurewebsites.net`
> - ✅ YES: `helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net`

| Function | Endpoint | Purpose | Auth |
|----------|----------|---------|------|
| `SendEmail` | `/api/sendemail` | Sends email notifications via Microsoft Graph | Anonymous |
| `SendTeamsNotification` | `/api/sendteamsnotification` | Posts to Teams channels via Bot Framework | Anonymous |
| `checkEscalations` | Timer trigger | Scheduled escalation checks | N/A |
| `runEscalationCheck` | `/api/runescalationcheck` | Manual escalation check trigger | Anonymous |
| `syncToTodo` | `/api/synctotodo` | Mirrors assigned Tech tickets into a Microsoft To Do list (create/update/complete) | Anonymous |
| `createUserTicket` | `/api/tickets` | Web-form ticket intake. Creates the list item **app-only** so the Tickets list can drop "Add Items" from users, blocking direct-in-SharePoint tickets that bypass all notifications (ticket #607). Resolves `isAdmin` server-side. | EasyAuth principal (`x-ms-client-principal`) |
| `agentApi` (×4) | `/api/agent/tickets`, `/api/agent/tickets/{id}`, `/api/agent/tickets/{id}/comments`, `/api/agent/tickets/{id}/status` | Agent-facing REST API: read ticket + thread, list, comment, change status — with activity logging and participant notifications | `x-agent-key` header == `AGENT_API_KEY` env var (unset = API disabled) |

> **Agent access:** headless agents (Fedora server, cron, etc.) use `tools/helpdesk-agent/`
> — a dependency-free CLI (`helpdesk.mjs`) and stdio MCP server (`mcp-server.mjs`)
> wrapping the agent API. They accept `?ticket=N` deep-link URLs directly. See
> `tools/helpdesk-agent/README.md` for setup.

### Function App Environment Variables

Set these in **Azure Portal → Function Apps → helpdesk-notify-func → Settings → Environment variables**:

#### For Email Function (SendEmail)
| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_CLIENT_ID` | Azure AD app registration client ID | `06fcde50-24bf-4d53-...` |
| `AZURE_CLIENT_SECRET` | Azure AD app registration client secret | (secret value) |
| `AZURE_TENANT_ID` | Azure AD tenant ID | `f0db97c1-2010-4d0c-...` |
| `SENDER_EMAIL` | Shared mailbox to send from | `supportdesk@skyparksantasvillage.com` |

#### For Teams Notification Function (SendTeamsNotification)
| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_APP_ID` | Bot's Azure AD app ID (same as AZURE_CLIENT_ID) | `06fcde50-24bf-4d53-...` |
| `BOT_APP_SECRET` | Bot's client secret (same as AZURE_CLIENT_SECRET) | (secret value) |
| `AZURE_TENANT_ID` | Azure AD tenant ID | `f0db97c1-2010-4d0c-...` |

#### For Escalation Functions
| Variable | Description |
|----------|-------------|
| `SHAREPOINT_SITE_ID` | SharePoint site ID |
| `TICKETS_LIST_ID` | Tickets list GUID |
| `ESCALATION_LIST_ID` | EscalationRules list GUID |
| `COMMENTS_LIST_ID` | TicketComments list GUID |
| `APP_URL` | Web app URL for email links |

#### For Notification Opt-Out (all notification-sending functions)
| Variable | Description |
|----------|-------------|
| `NOTIFICATION_OPTOUT_LIST_ID` | NotificationOptOut list GUID. Emails on this list are dropped by every server-side send path (`graphHelpers.sendMail`, the `SendEmail` HTTP function, and `checkEscalations`). People keep all access/roles — only email delivery stops. Managed from the web UI (Settings → Notification Opt-Out). Leave unset to disable suppression. |

### Self-Notification Suppression

Nobody is emailed about a change they made themselves. Two mirrored chokepoints enforce it — **any new notification path gets the behavior for free; don't re-implement it per call site**:

| Side | Where | How |
|------|-------|-----|
| Frontend | `src/lib/graphClient.ts` → `sendEmail` | `actorEmail` defaults to `getCurrentActor()` (`src/lib/currentActor.ts`, set from `layout.tsx` on every MSAL account activation). Recipient == actor → the send is skipped. Pass `""` explicitly to force a deliberate email-to-self. |
| Functions | `graphHelpers.sendMail(…, { actorEmail })` and the `SendEmail` HTTP function's `actorEmail` body field | `src/lib/selfNotify.js` — `isSelfNotification` / `excludeActor` / `excludeActorMembers`. |

The three approval-request functions (`sendApprovalRequest`, `sendPurchaseApprovalRequest`, `sendCdwApprovalRequest`) drop the requester from the expanded GM group; if that empties the list they return `note: "self_only"` and send nothing — the item is still Pending in the app.

**Deliberate limit:** suppression matches individual addresses only. Mail to a shared/M365 group address (e.g. an Inventory queue) still reaches every member including the actor — Graph has no per-recipient suppression, and expanding the group into N sends would break the shared queue's reply semantics. Distinct from `NOTIFICATION_OPTOUT_LIST_ID`, which suppresses by *recipient* regardless of who acted.

#### For Web-Form Ticket Creation (createUserTicket)
| Variable | Description |
|----------|-------------|
| `ADMIN_EMAILS` | Comma-separated admin addresses. Combined with `GENERAL_MANAGERS_GROUP_ID` to resolve admin status **server-side** — a client-supplied `isAdmin` would let anyone auto-approve their own Request. Resolution failures fall back to non-admin (Pending). |

> Requires App Service Authentication (EasyAuth) enabled with **"Allow unauthenticated access"**.
> Requiring auth app-wide breaks every anonymous endpoint and takes notifications down.
> Frontend counterparts are `NEXT_PUBLIC_TICKET_CREATE_FUNCTION_URL` and
> `NEXT_PUBLIC_FUNCTION_API_SCOPE`; with either unset the SPA falls back to writing to
> the list directly. Full cutover steps: `docs/ticket-creation-lockdown.md`.

#### For the Agent API (agentApi)
| Variable | Description |
|----------|-------------|
| `AGENT_API_KEY` | Shared secret required in the `x-agent-key` header on all `/api/agent/*` endpoints. Generate with `openssl rand -hex 32`. Leave unset to disable the agent API entirely (endpoints return 503). Client-side counterpart is `HELPDESK_AGENT_KEY` (see `tools/helpdesk-agent/README.md`). |

#### For Microsoft To Do Sync (syncToTodo)
| Variable | Description |
|----------|-------------|
| `TODO_TARGET_USER` | UPN whose Microsoft To Do the tasks land in (`jnunn@skyparksantasvillage.com`). Requires the `Tasks.ReadWrite.All` application permission with admin consent. |
| `TODO_SYNC_MAP_LIST_ID` | GUID of the `TodoSyncMap` SharePoint list (ticket → To Do task mapping). Provision it with `scripts/create-todo-syncmap-list.ps1`. |
| `TODO_LIST_NAME` | Optional. Display name of the To Do list to use/create (default `SkyPark Tech Tickets`). The function creates it on first use — no GUID needed. |
| `TODO_LIST_ID` | Optional. Pin a specific To Do list id to skip the by-name lookup. |
| `APP_URL` | Web app URL for the ticket deep-link on each task (shared with the escalation functions). |

> **Scope:** only tickets with `ProblemType == "Tech"` **and** an assignee are mirrored. Frontend kill switch is `NEXT_PUBLIC_TODO_SYNC_ENABLED` in the workflow file; the sync is one-directional (Help Desk → To Do).

### Azure AD App Permissions Required

The Azure AD app registration needs these **Application permissions** (not Delegated) with **admin consent**:

| Permission | Purpose |
|------------|---------|
| `Mail.Send` | Send emails from shared mailbox |
| `Sites.ReadWrite.All` | Read/write SharePoint lists |
| `User.Read.All` | Look up user information |
| `Tasks.ReadWrite.All` | Create/update Microsoft To Do tasks for the To Do sync (`syncToTodo`). ⚠️ Tenant-wide: To Do has no per-mailbox scoping policy, so this grants the daemon read/write to all users' tasks. |

### Teams Bot Configuration

Teams notifications use **Bot Framework SDK** (not Graph API) for proactive messaging.

#### Why Bot Framework Instead of Graph API?
- Graph API requires a user context to post messages
- Bot Framework allows app-only (proactive) messaging to channels
- Bot can post without any user being signed in

#### Setup Requirements
1. **Azure Bot Service** - Register the bot in Azure Portal
2. **Bot Channel Registration** - Enable the Teams channel
3. **Teams App Manifest** - `teams-app/manifest.json` includes bot configuration (v1.3.0+)
4. **App Installation** - The Help Desk Teams app must be installed in each Team that needs notifications

#### Bot Configuration in manifest.json
```json
{
  "bots": [
    {
      "botId": "06fcde50-24bf-4d53-838d-ecc035653d8f",
      "scopes": ["team"],
      "supportsFiles": false,
      "isNotificationOnly": true
    }
  ]
}
```

### Deploying Function Changes

```bash
cd azure-functions
func azure functionapp publish helpdesk-notify-func --javascript --build remote
```

> **⚠️ `--build remote` is REQUIRED — omitting it takes the whole app down.**
> There is no `node_modules` in this repo, so a default publish uploads ~100 KB of
> source with `remotebuild = false`, Kudu skips the Oryx build, and the app comes up
> with **zero functions registered** — every endpoint 404s and all notification email
> stops until you republish. The deploy still prints "The deployment was successful!"
> and a Running host status, so trust the function list, not the success message.
> (Learned the hard way on 2026-08-14: ~6 minutes of dead endpoints.)
>
> `--javascript` is also required — there's no `local.settings.json` to infer the
> worker runtime from.

**After deployment, verify the functions actually registered:**

```bash
func azure functionapp list-functions helpdesk-notify-func
# Expect 25 functions (21 httpTrigger + 4 timerTrigger). Zero or a short list = broken deploy.
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/sendemail
# Expect 204. A 404 means the app has no functions loaded.
```

Timer triggers (`checkEscalations`, `purchaseReminders`, `pollInboundReplies`,
`autoCloseRecovered`) fail silently when a deploy breaks — nothing 404s visibly, the
scheduled work just never runs. Always check the full list, not just one endpoint.

### Testing Functions Manually

**Test email:**
```bash
curl -X POST "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/sendemail" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","htmlContent":"<p>Test</p>"}'
```

**Test Teams notification:**
```bash
curl -X POST "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/sendteamsnotification" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"...","channelId":"...","card":{...}}'
```

## Application Insights (Telemetry)

The app uses Azure Application Insights for production telemetry — client-side errors, page views, API call performance, and user flows.

### Architecture

A single Application Insights resource (`helpdesk-insights`) serves both the frontend and the Function App. The `cloud_roleName` property distinguishes them:

| Component | `cloud_roleName` | How it's set |
|-----------|-------------------|--------------|
| Frontend (browser) | `helpdesk-web` | Telemetry initializer in `src/lib/appInsights.ts` |
| Function App | `helpdesk-notify-func` | Set automatically by Azure |

### Azure Resource

| Property | Value |
|----------|-------|
| Resource name | `helpdesk-insights` |
| Resource Group | `AppInsights` (shared across apps, not just HelpDesk) |
| Region | West US 2 |

### Key Files

- `src/lib/appInsights.ts` — Singleton wrapper: `initAppInsights()`, `setAuthenticatedUser()`, `trackEvent()`, `getAppInsights()`
- `src/app/layout.tsx` — Initializes App Insights after `debugCapture`, sets user context on MSAL login

### Relationship with `debugCapture.ts`

Both coexist — they serve different purposes:
- `debugCapture.ts` → Local in-browser ring buffer for generating debug reports attached to support tickets (user-facing)
- Application Insights → Cloud-side telemetry dashboard for monitoring errors, performance, and usage patterns (developer-facing)

`debugCapture` intercepts `console.error` first, then calls the original, which App Insights also hooks into. No conflicts.

### Configuration

**Frontend:** The connection string is stored as GitHub Secret `APPINSIGHTS_CONNECTION_STRING` and referenced in the workflow file as `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING`. If the connection string is not set (local dev), App Insights silently no-ops.

**Function App:** Set `APPLICATIONINSIGHTS_CONNECTION_STRING` in Azure Portal → Function Apps → `helpdesk-notify-func` → Environment variables. Use the same connection string as the frontend so both report to the same resource.

### Custom Events

Use `trackEvent()` from `src/lib/appInsights.ts` to log custom events:

```typescript
import { trackEvent } from "@/lib/appInsights";
trackEvent("ApprovalDecision", { ticketId: "123", decision: "approved" });
```

### Querying Telemetry

Queries use Entra ID authentication via the Azure CLI (API keys are deprecated). Requires `az login` and Reader role on the resource.

**Azure Portal:** Application Insights → `helpdesk-insights` → Overview / Live Metrics / Failures / Performance

**Via Azure CLI:**
```bash
# Recent exceptions
az monitor app-insights query \
  --app helpdesk-insights \
  --resource-group AppInsights \
  --analytics-query "exceptions | where timestamp > ago(1h) | order by timestamp desc | take 20"

# Telemetry summary by component
az monitor app-insights query \
  --app helpdesk-insights \
  --resource-group AppInsights \
  --analytics-query "union requests, pageViews, exceptions, traces | summarize count() by itemType, cloud_RoleName | order by count_ desc"

# Frontend page views
az monitor app-insights query \
  --app helpdesk-insights \
  --resource-group AppInsights \
  --analytics-query "pageViews | where cloud_RoleName == 'helpdesk-web' | where timestamp > ago(1h) | order by timestamp desc | take 20"
```

> **Note:** The old `x-api-key` REST API authentication is deprecated (March 2026). All queries should use Entra ID auth via `az login` or OAuth2 bearer tokens.

## Troubleshooting

### Common Issues and Fixes

#### "NEXT_PUBLIC_* not configured" or using wrong URL
**Cause:** Environment variables set in Azure Portal instead of workflow file.
**Fix:** Edit `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml` and add/update variables in the `env:` section.

#### CORS errors when calling Azure Functions
**Cause:** Functions not deployed or CORS not configured.
**Fix:**
1. Ensure functions are deployed: `func azure functionapp publish helpdesk-notify-func --javascript --build remote`
2. Functions have CORS headers built-in (code handles OPTIONS requests)

#### 401 Unauthorized from Azure Functions
**Cause:** Functions set to `authLevel: "function"` requiring a function key.
**Fix:** Functions should use `authLevel: "anonymous"` (they have internal security via app credentials).

#### 500 Internal Server Error from SendEmail
**Cause:** Usually missing environment variables or Graph API permission issues.
**Fix:**
1. Check all env vars are set in Function App Configuration
2. Verify `Mail.Send` application permission has admin consent
3. Check Application Insights logs: `az monitor app-insights query --app helpdesk-insights --resource-group AppInsights ...`

#### "The internet message header name should start with 'x-'"
**Cause:** Microsoft Graph API doesn't allow standard email headers like `In-Reply-To`.
**Fix:** Don't use standard headers. Email threading relies on subject line matching.

#### Requester field not saving in SharePoint
**Cause:** The `EMail` field in User Information List is not indexed.
**Fix:** Use the `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly` header (already implemented in `getSiteUserId`).

#### Teams notification "Bot not part of conversation roster"
**Cause:** Help Desk Teams app not installed in the target Team.
**Fix:** Install the Help Desk app in each Team that needs notifications.

#### DNS resolution failed for function app
**Cause:** Using wrong URL format for Flex Consumption function app.
**Fix:** Use the full URL with unique identifier: `helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net`

### Viewing Function Logs

Requires `az login` (Entra ID auth — API keys are deprecated).

**Via Azure CLI:**
```bash
az monitor app-insights query \
  --app helpdesk-insights \
  --resource-group AppInsights \
  --analytics-query "traces | where cloud_RoleName == 'helpdesk-notify-func' | where timestamp > ago(1h) | order by timestamp desc | take 50"
```

**Via Azure Portal:**
Application Insights → `helpdesk-insights` → Logs → filter by `cloud_RoleName == "helpdesk-notify-func"`

## Roadmap / Planned Features

### ✅ Activity/Audit Log (Completed)
Track and display a comprehensive log of all system activity:
- ✅ **Emails sent** - To whom, subject, when, triggered by what (new ticket, escalation, etc.)
- ✅ **Notifications** - Escalation alerts, assignment notifications
- ✅ **Ticket events** - Creation, status changes, priority changes, reassignments
- ✅ **Comments** - When added, by whom
- ✅ **Approval actions** - Approved/rejected, by whom
- ✅ **Escalation actions** - What rule triggered, what action was taken

Implementation:
- `ActivityLog` SharePoint list with columns: Timestamp, EventType, TicketId, Actor, Details, Metadata
- Events logged from: graphClient.ts, new/page.tsx, TicketDetail.tsx, DetailsPanel.tsx
- Activity Log viewer accessible via Settings → Activity Log
- Filters by event type, ticket number, result limit

### ✅ Purchase Request Workflow (Completed)
Multi-stage purchase lifecycle: Request → GM Decision → Purchaser Orders → Inventory Receives
- ✅ **Purchase request creation** - Toggle on Request tickets, with item URL/qty/cost/justification/project fields
- ✅ **GM approval decisions** - Approve, Approve with Changes, Approve & Ordered, Deny
- ✅ **Purchaser workflow** - Mark as purchased with vendor/confirmation/cost/delivery details
- ✅ **Inventory receiving** - Mark as received with date and notes
- ✅ **RBAC roles** - Purchaser and Inventory roles via Entra ID groups
- ✅ **Email notifications** - At each workflow step to relevant parties
- ✅ **Dashboard presets** - Purchase Queue (purchasers), Incoming Orders (inventory)
- ✅ **Ticket list indicator** - Shopping cart icon on purchase request tickets
- ✅ **Purchase status badge** - Color-coded status through the workflow

Implementation:
- 17 new SharePoint columns on Tickets list (IsPurchaseRequest, PurchaseStatus, PurchaseVendor, etc.)
- New RBAC group types: `purchaser`, `inventory` in RBACGroups SharePoint list
- New components: PurchaseStatusBadge, PurchaseActionPanel, ReceiveActionPanel
- Modified: ApprovalActionPanel (4-button layout for purchases), DetailsPanel (purchase details section)
- New env vars: `NEXT_PUBLIC_PURCHASER_GROUP_ID`, `NEXT_PUBLIC_INVENTORY_GROUP_ID`

**Approval notification fan-out (two independent paths — change both or neither):**

| Path | Code | Notifies |
|------|------|----------|
| In-app decision | `purchaseEmail.notifyPurchaseDecision` (called by `PurchaseApprovalPanel`) | Requester always; purchasers when `notifiesPurchasers(decision)` — i.e. `Approved` / `Approved with Changes`, not `Approved & Ordered` |
| One-click from email | `azure-functions/.../purchaseApprovalAction.js` | Requester + participants; purchasers on `Approved` (the only approve variant that path can produce) |

The in-app path shipped without any purchaser notification, so requests approved inside the app sat in the order queue silently — purchasers only found them by opening `/orders`. Purchaser addresses come from the `RBACGroups` list (`purchaserGroupIds`, supports multiple groups) with `NEXT_PUBLIC_PURCHASER_GROUP_ID` as fallback; the Function still uses only its single `PURCHASER_GROUP_ID` env var.

### Planned: Email-based Purchase Auto-Update
Auto-extract vendor + confirmation # from forwarded confirmation emails to update purchase tickets.

---

## Related Documentation

- `/README.md` - Full project documentation
- Azure AD App: `06fcde50-24bf-4d53-838d-ecc035653d8f`
- SharePoint Site: https://skyparksv.sharepoint.com/sites/helpdesk
