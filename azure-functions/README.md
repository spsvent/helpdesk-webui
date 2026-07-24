# Help Desk Notification Functions

Azure Functions for sending notifications from the Help Desk app.

## Functions

### 1. SendEmail
Sends emails using Microsoft Graph API with app-only authentication.

**Endpoint:** `POST /api/SendEmail`

**Request Body:**
```json
{
  "to": "user@example.com",
  "subject": "Email Subject",
  "htmlContent": "<p>Email body</p>",
  "conversationId": "optional-thread-id"
}
```

### 2. SendTeamsNotification
Posts Adaptive Card messages to Teams channels using Bot Framework.

**Endpoint:** `POST /api/SendTeamsNotification`

**Request Body:**
```json
{
  "teamId": "team-guid",
  "channelId": "19:xxx@thread.tacv2",
  "card": { /* Adaptive Card JSON */ }
}
```

### 3. CheckEscalations
Timer-triggered function that checks for tickets needing escalation (runs hourly).

**Manual Trigger:** `POST /api/runEscalationCheck`

### 4. ConvertHeic
Stateless HEIC → JPEG converter. The SPA POSTs the raw HEIC bytes and gets JPEG
bytes back so it can preview iPhone photos inline (Chrome/Firefox can't decode
HEIC). This function has **no** SharePoint/Graph access — the SPA stores the
returned JPEG as a sibling attachment using the caller's own token — so it needs
no app settings or extra permissions, just the `heic-convert` dependency
(installed by `npm install`).

**Endpoint:** `POST /api/convertheic` — request body: raw HEIC bytes
(`Content-Type: application/octet-stream`). Response: `image/jpeg` bytes (or a
JSON error). Rejects empty bodies and payloads over 30 MB.

### 5. CreateTicket (external ticket-intake API)
Lets another service (monitoring/alerting, an internal app) file a HelpDesk ticket
over HTTP. Unlike the rest of the app, ticket creation normally happens client-side
in the SPA; this is the only server-side create path. Creates a full-fidelity ticket
app-only: auto-assigns using the same **AutoAssign** list the web form uses, emails
the assignee, writes an activity-log entry, and **dedupes** flapping alerts.

**Auth:** `authLevel: "function"` — caller must pass the host/function key as
`?code=<key>` (or an `x-functions-key` header). Get it with
`az functionapp function keys list -n helpdesk-notify-func -g SupportDesk --function-name CreateTicket`.

**Endpoint:** `POST /api/createticket?code=<key>` — JSON body:

| field | required | notes |
|-------|----------|-------|
| `title` | ✓ | |
| `description` | ✓ | |
| `problemType` | ✓ | one of: Tech, Operations, Facilities, Marketing, HR, Inventory, Other (drives routing) |
| `priority` | | Low \| Normal \| High \| Urgent (default Normal) |
| `problemTypeSub`, `problemTypeSub2` | | free text |
| `location` | | |
| `requesterEmail` | | the affected user; resolved to the Requester person field when possible |
| `assigneeEmail` | | explicit assignee — overrides AutoAssign routing |
| `source` | | stamped into SupportChannel (`API: <source>`) + the assignment email |
| `externalRef` | | dedup key — a repeat call reuses the open ticket instead of duplicating |

Only **Problem** tickets are supported in v1 (`category` is forced to `Problem`);
Request tickets need the GM approval flow and are a follow-up.

**Responses:** `201 {ok,deduped:false,id,ticketNumber,assignedTo,url}` on create;
`200 {ok,deduped:true,...}` when folded into an existing open ticket by `externalRef`;
`400 {ok:false,error,details}` on validation failure.

```bash
curl -X POST "https://helpdesk-notify-func-...azurewebsites.net/api/createticket?code=<key>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Reindeer Room printer offline","description":"Uptime Kuma: 172.18.10.12 unreachable 5m",
       "problemType":"Tech","priority":"High","source":"uptime-kuma","externalRef":"kuma-8842"}'
```

**Extra app settings this function needs** (beyond the shared Graph/site settings):
`AUTO_ASSIGN_LIST_ID` (`57a6cc6d-2dd1-4022-aaa2-45aa4d947761`) and
`ACTIVITY_LOG_LIST_ID` (`a961cb69-a588-4ca0-aa04-b421ebcc792a`). It also needs an
indexed **`ExternalRef`** single-line-of-text column on the Tickets list for dedup.
Without these it still creates tickets — just unassigned, unlogged, and un-deduped.

**Uptime Kuma:** the endpoint also accepts Uptime Kuma's **native** webhook payload
(`{ heartbeat, monitor, msg }`) directly — no custom body templating needed. It
turns **DOWN** events (`heartbeat.status === 0`) into a Tech ticket keyed
`externalRef: kuma-<monitorId>` (so a flapping monitor folds onto one open ticket).
Ticket **priority comes from the monitor's Kuma tag**: Critical→Urgent,
Important→High, Moderate→Normal, untagged→Normal. Up/pending/maintenance events
up/pending/maintenance events are acked `200 {skipped:true}` with no ticket. Kuma
setup: add a **Webhook** notification → `POST …/api/createticket`, body type
"application/json" (preset), and put the function key in an `x-functions-key`
Additional Header (`{"x-functions-key":"<key>"}`), then attach it to the monitors
that should open tickets.

## Deployment

### Prerequisites
- Azure CLI installed
- Node.js 24+
- Azure Functions Core Tools v4

### Create New Function App in Azure

```bash
# Login to Azure
az login

# Create function app with Node.js 20
az functionapp create \
  --name helpdesk-notify-func \
  --resource-group skypark-helpdesk-rg \
  --storage-account <your-storage-account> \
  --consumption-plan-location westus2 \
  --runtime node \
  --runtime-version 24 \
  --functions-version 4
```

### Configure App Settings in Azure

```bash
az functionapp config appsettings set \
  --name helpdesk-notify-func \
  --resource-group skypark-helpdesk-rg \
  --settings \
    "AZURE_CLIENT_ID=06fcde50-24bf-4d53-838d-ecc035653d8f" \
    "AZURE_TENANT_ID=f0db97c1-2010-4d0c-826e-d6e0f2b25f2f" \
    "AZURE_CLIENT_SECRET=<your-email-secret>" \
    "BOT_APP_ID=06fcde50-24bf-4d53-838d-ecc035653d8f" \
    "BOT_APP_SECRET=<your-bot-secret>" \
    "SENDER_EMAIL=supportdesk@skyparksantasvillage.com" \
    "SHAREPOINT_SITE_ID=<site-id>" \
    "TICKETS_LIST_ID=<tickets-list-id>" \
    "COMMENTS_LIST_ID=<comments-list-id>" \
    "ESCALATION_LIST_ID=<escalation-list-id>" \
    "APP_URL=https://tickets.spsvent.net"
```

### Deploy

```bash
cd azure-functions
npm install
func azure functionapp publish helpdesk-notify-func
```

### Update Web App Environment Variables

After deploying, update the web app's environment variables in Azure Static Web Apps:

- `NEXT_PUBLIC_EMAIL_FUNCTION_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/SendEmail?code=<function-key>`
- `NEXT_PUBLIC_TEAMS_FUNCTION_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/SendTeamsNotification?code=<function-key>`
- `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/runEscalationCheck?code=<function-key>`
- `NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/sendApprovalRequest?code=<function-key>`
- `NEXT_PUBLIC_SEND_CDW_APPROVAL_REQUEST_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/sendCdwApprovalRequest?code=<function-key>`
- `NEXT_PUBLIC_SEND_PURCHASE_APPROVAL_REQUEST_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/sendPurchaseApprovalRequest?code=<function-key>`
- `NEXT_PUBLIC_HEIC_CONVERT_URL` = `https://helpdesk-notify-func.azurewebsites.net/api/convertheic?code=<function-key>`

All of the above are `authLevel: "function"` — the `?code=` key is required. The
approval-request triggers and the HEIC converter used to be anonymous; after
deploying this version, add the key to each URL or the SPA's calls will 401.
Only the email-link redemption endpoints (`approvalAction`, `cdwApprovalAction`,
`purchaseApprovalAction`) stay anonymous: they are opened from email one-click
links and authorize via their signed token instead.

Get the function keys from Azure Portal → Function App → Functions → [Function Name] → Function Keys

## Teams Bot Setup

For Teams notifications to work, the app must be registered as a bot:

1. **Create Azure Bot** in Azure Portal
   - Use existing app registration: `06fcde50-24bf-4d53-838d-ecc035653d8f`
   - Type: Single Tenant

2. **Enable Teams Channel**
   - Go to Azure Bot → Channels → Add Microsoft Teams

3. **Update Teams App Manifest**
   - Add bot configuration to `teams-app/manifest.json`
   - Reinstall the app in Teams

4. **Install in Teams**
   - The app (with bot) must be installed in each Team where notifications are needed

## Local Development

```bash
cd azure-functions
npm install

# Ensure local.settings.json has all required settings
# (This file is gitignored - contains secrets)

# Run locally
npm start
```

## Migrating from helpdesk-email-func

If upgrading from the old function app:

1. Create the new `helpdesk-notify-func` in Azure (Node.js 24)
2. Copy all app settings from the old function
3. Add new settings: `BOT_APP_ID`, `BOT_APP_SECRET`
4. Deploy: `func azure functionapp publish helpdesk-notify-func`
5. Update web app environment variables to point to new URLs
6. Test both email and Teams notifications
7. Delete old `helpdesk-email-func` when confirmed working
