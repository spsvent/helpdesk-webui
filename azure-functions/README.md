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
