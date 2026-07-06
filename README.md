# SkyPark Helpdesk Web UI

A React/Next.js web application for viewing and managing helpdesk tickets stored in SharePoint Online.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACES                         │
├─────────────────────────────────────────────────────────────┤
│  Power Apps Form            Custom Web UI (This App)        │
│  (Teams Tab)                (Azure Static Web Apps)         │
│  - Create new tickets       - View/edit tickets             │
│                             - Jira-style conversation       │
│                             - Comment threads               │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
               │     Microsoft Graph API     │
               │                             │
┌──────────────▼─────────────────────────────▼────────────────┐
│            SHAREPOINT ONLINE (Source of Truth)              │
│  Site: https://skyparksv.sharepoint.com/sites/helpdesk      │
│  Lists: Tickets, TicketComments                             │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Authentication | MSAL.js 2.0 (Azure AD) |
| API | Microsoft Graph API |
| Hosting | Azure Static Web Apps (Free tier) |
| CI/CD | GitHub Actions |

## Trust Model

- The SPA writes to SharePoint with the signed-in user's **delegated Graph token**
  (`Sites.ReadWrite.All`). All in-app permission checks — RBAC roles, module access rules,
  edit/status gates — run **client-side**: they shape the UI but are not a security boundary,
  since a user can replay their own token against the Graph API directly.
- The **effective write boundary is the SharePoint list ACL**: whatever the signed-in account
  can write via Graph, it can write regardless of what the UI hides or disables.
- The only **server-enforced** gate is the email-approval path: the Azure Functions mint
  signed, expiring, single-purpose action tokens and verify them (plus a pending-status gate
  and `If-Match` conditional PATCH) before recording a decision; the Functions themselves
  require a function key.
- In-app approval decisions use the same fresh-read + pending gate + `If-Match` PATCH, which
  prevents stale-tab overwrites and double decisions — but it executes client-side, so it
  mitigates accidents, not a hostile user with a valid token.
- Moving to server-side enforcement would mean routing writes through an authenticated API
  (e.g. the Function App) that re-applies the RBAC rules and writes with an app-only identity,
  while tightening the SharePoint list ACL so end users lose direct write access.

## Key URLs & IDs

| Resource | Value |
|----------|-------|
| **Production URL** | https://lively-coast-062dfc51e.1.azurestaticapps.net |
| **SharePoint Site** | https://skyparksv.sharepoint.com/sites/helpdesk |
| **Azure AD App (Client ID)** | `06fcde50-24bf-4d53-838d-ecc035653d8f` |
| **Tenant ID** | `f0db97c1-2010-4d0c-826e-d6e0f2b25f2f` |
| **GitHub Repo** | https://github.com/spsvent/helpdesk-webui |

## Project Structure

```
webui/
├── src/
│   ├── app/                      # Next.js 14 App Router
│   │   ├── layout.tsx            # Root layout with metadata
│   │   └── page.tsx              # Main app page (auth + ticket UI)
│   ├── components/
│   │   ├── TicketList.tsx        # Sidebar list of tickets
│   │   ├── TicketDetail.tsx      # Main ticket view wrapper
│   │   ├── ConversationThread.tsx # Description + comments display
│   │   ├── CommentInput.tsx      # Add new comment form
│   │   ├── DetailsPanel.tsx      # Right sidebar (status, priority, etc)
│   │   └── UserAvatar.tsx        # User profile photo display
│   ├── lib/
│   │   ├── msalConfig.ts         # Azure AD authentication config
│   │   └── graphClient.ts        # Microsoft Graph API wrapper
│   └── types/
│       └── ticket.ts             # TypeScript interfaces
├── .github/workflows/
│   └── azure-static-web-apps-*.yml  # Auto-generated CI/CD
├── .env.local                    # Environment variables (not in git)
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
└── package.json                  # Dependencies
```

## Environment Variables

Create `.env.local` with these values:

```env
# Azure AD App Registration
NEXT_PUBLIC_CLIENT_ID=06fcde50-24bf-4d53-838d-ecc035653d8f
NEXT_PUBLIC_TENANT_ID=f0db97c1-2010-4d0c-826e-d6e0f2b25f2f

# SharePoint Configuration
NEXT_PUBLIC_SHAREPOINT_SITE_ID=skyparksv.sharepoint.com,946827f8-eb7d-4319-a7bc-3f73eb568a0c,a183a604-4a6e-4d21-89e9-870711e87723
NEXT_PUBLIC_TICKETS_LIST_ID=018f0d5c-318d-4856-a7f2-491f4e71a554
NEXT_PUBLIC_COMMENTS_LIST_ID=2484abfd-ca8a-4202-ab24-82c0acce03c2
```

**To get these IDs**, run `get-list-ids.ps1` from the parent SupportTickets folder.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

## Deployment

Deployment is automatic via GitHub Actions on push to `main` branch.

**Manual deployment** (if needed):

```bash
# Build
npm run build

# Deploy with SWA CLI
swa deploy ./out --deployment-token "YOUR_TOKEN" --env production
```

## Azure AD App Registration

The app uses Azure AD for authentication with these settings:

| Setting | Value |
|---------|-------|
| Platform | Single-page application (SPA) |
| Redirect URIs | `http://localhost:3000`, `https://lively-coast-062dfc51e.1.azurestaticapps.net` |
| Implicit grant | Disabled (uses PKCE) |

**API Permissions (Delegated):**
- `User.Read` - Sign in and read user profile
- `Sites.ReadWrite.All` - Read/write SharePoint sites
- `User.ReadBasic.All` - Read user profiles for avatars

## SharePoint Lists

### Tickets List
Created via `01-sharepoint-site.ps1`. Contains:
- Title, Description, Status, Priority, Category
- RequestedBy, AssignedTo, RequestedFor
- DueDate, ResolutionDate, Resolution

### TicketComments List
Created via `03-comments-list.ps1`. Contains:
- TicketID (links to parent ticket)
- CommentBody (rich text)
- IsInternal (boolean)
- CommentType (Comment, StatusChange, Assignment, Resolution)

## Graph API Endpoints Used

```typescript
// Get all tickets
GET /sites/{siteId}/lists/{ticketsListId}/items?$expand=fields

// Get comments for a ticket
GET /sites/{siteId}/lists/{commentsListId}/items?$filter=fields/TicketID eq {id}&$expand=fields

// Add comment
POST /sites/{siteId}/lists/{commentsListId}/items
Body: { fields: { TicketID: 123, CommentBody: "...", IsInternal: false } }

// Update ticket
PATCH /sites/{siteId}/lists/{ticketsListId}/items/{itemId}
Body: { fields: { Status: "In Progress" } }

// Get user photo
GET /users/{userId}/photo/$value
```

## Troubleshooting

### "No matching Static Web App was found"
- Check the deployment token is valid
- Ensure the GitHub secret name matches the workflow file
- Try regenerating the deployment token in Azure Portal

### Authentication errors
- Verify redirect URIs in Azure AD app registration
- Check that API permissions are granted (admin consent if needed)
- Ensure .env.local has correct Client ID and Tenant ID

### Build failures
- Check package.json for dependency conflicts
- Ensure eslint-config-next version matches Next.js version
- Run `npm install` locally to verify dependencies resolve

## Related Files

| File | Purpose |
|------|---------|
| `/SupportTickets/01-sharepoint-site.ps1` | Creates SharePoint site and Tickets list |
| `/SupportTickets/03-comments-list.ps1` | Creates TicketComments list |
| `/SupportTickets/get-list-ids.ps1` | Gets SharePoint IDs for .env.local |

## Maintenance

**Updating dependencies:**
```bash
npm update
npm audit fix
```

**If Azure Static Web App needs to be recreated:**
```bash
az login
az staticwebapp create \
  --name skypark-helpdesk \
  --resource-group SupportDesk \
  --source https://github.com/spsvent/helpdesk-webui \
  --branch main \
  --app-location "/" \
  --output-location "out" \
  --login-with-github
```

Then add the new URL to Azure AD app redirect URIs.
