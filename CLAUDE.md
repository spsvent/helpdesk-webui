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

### Adding Environment Variables to Azure (Production)

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to: **Static Web Apps** → **skypark-helpdesk-v2**
3. In the left sidebar under **Settings**, click **Environment variables**
4. Ensure **Production** is selected in the Environments dropdown
5. Click **+ Add** to add a new variable
6. Enter the Name and Value
7. Click **Apply** at the bottom to save
8. **Important**: After adding/changing variables, trigger a rebuild:
   ```bash
   git commit --allow-empty -m "Trigger rebuild for env vars" && git push
   ```

**Note**: `NEXT_PUBLIC_*` variables are baked in at build time. Changes won't take effect until the app is rebuilt.

## Deployment

Deployment is automatic via GitHub Actions on push to `main` branch.

Production URL: https://lively-coast-062dfc51e.1.azurestaticapps.net

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

---

## Related Documentation

- `/README.md` - Full project documentation
- Azure AD App: `06fcde50-24bf-4d53-838d-ecc035653d8f`
- SharePoint Site: https://skyparksv.sharepoint.com/sites/helpdesk
