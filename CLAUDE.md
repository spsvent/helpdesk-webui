# Claude Code Project Instructions

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

### Teams Notifications
- `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED` - "true" to enable Teams notifications
- `NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID` - TeamsChannels SharePoint list ID
- `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE` - Only notify for tickets after this date (YYYY-MM-DD)

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

### Azure AD App Permissions Required

The Azure AD app registration needs these **Application permissions** (not Delegated) with **admin consent**:

| Permission | Purpose |
|------------|---------|
| `Mail.Send` | Send emails from shared mailbox |
| `Sites.ReadWrite.All` | Read/write SharePoint lists |
| `User.Read.All` | Look up user information |

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
func azure functionapp publish helpdesk-notify-func
```

**After deployment, verify functions are listed:**
- SendEmail
- SendTeamsNotification
- checkEscalations
- runEscalationCheck

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

## Troubleshooting

### Common Issues and Fixes

#### "NEXT_PUBLIC_* not configured" or using wrong URL
**Cause:** Environment variables set in Azure Portal instead of workflow file.
**Fix:** Edit `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml` and add/update variables in the `env:` section.

#### CORS errors when calling Azure Functions
**Cause:** Functions not deployed or CORS not configured.
**Fix:**
1. Ensure functions are deployed: `func azure functionapp publish helpdesk-notify-func`
2. Functions have CORS headers built-in (code handles OPTIONS requests)

#### 401 Unauthorized from Azure Functions
**Cause:** Functions set to `authLevel: "function"` requiring a function key.
**Fix:** Functions should use `authLevel: "anonymous"` (they have internal security via app credentials).

#### 500 Internal Server Error from SendEmail
**Cause:** Usually missing environment variables or Graph API permission issues.
**Fix:**
1. Check all env vars are set in Function App Configuration
2. Verify `Mail.Send` application permission has admin consent
3. Check Application Insights logs: `az monitor app-insights query --app helpdesk-notify-func ...`

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

**Via Azure CLI:**
```bash
az monitor app-insights query \
  --app helpdesk-notify-func \
  --resource-group SupportDesk \
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc | take 50"
```

**Via Azure Portal:**
Function Apps → helpdesk-notify-func → Functions → [function name] → Monitor → Logs

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

### Planned: Email-based Purchase Auto-Update
Auto-extract vendor + confirmation # from forwarded confirmation emails to update purchase tickets.

---

## Related Documentation

- `/README.md` - Full project documentation
- Azure AD App: `06fcde50-24bf-4d53-838d-ecc035653d8f`
- SharePoint Site: https://skyparksv.sharepoint.com/sites/helpdesk
