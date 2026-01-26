# SkyPark Help Desk - Deployment Guide

This guide provides step-by-step instructions to deploy a new instance of the SkyPark Help Desk application from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Azure AD App Registration](#azure-ad-app-registration)
3. [SharePoint Site Setup](#sharepoint-site-setup)
4. [GitHub Repository Setup](#github-repository-setup)
5. [Azure Static Web App Deployment](#azure-static-web-app-deployment)
6. [Azure Functions Setup](#azure-functions-setup)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Post-Deployment Configuration](#post-deployment-configuration)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [ ] Microsoft 365 tenant with SharePoint Online
- [ ] Azure subscription
- [ ] GitHub account
- [ ] Admin access to Azure AD (Entra ID)
- [ ] Node.js 18+ installed locally
- [ ] Git installed locally

---

## Azure AD App Registration

### Step 1: Create the App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **+ New registration**
4. Configure:
   - **Name**: `SkyPark Help Desk` (or your preferred name)
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**:
     - Type: `Single-page application (SPA)`
     - URI: `http://localhost:3000` (add production URL later)
5. Click **Register**
6. **Copy the Application (client) ID** - you'll need this as `NEXT_PUBLIC_CLIENT_ID`
7. **Copy the Directory (tenant) ID** - you'll need this as `NEXT_PUBLIC_TENANT_ID`

### Step 2: Configure Authentication

1. Go to **Authentication** in the left sidebar
2. Under **Single-page application**, add redirect URIs:
   - `http://localhost:3000` (development)
   - `https://your-production-url.com` (production - add after deployment)
3. Under **Implicit grant and hybrid flows**, check:
   - [ ] Access tokens
   - [ ] ID tokens
4. Click **Save**

### Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `User.Read` - Sign in and read user profile
   - `User.ReadBasic.All` - Read all users' basic profiles
   - `Sites.ReadWrite.All` - Read and write SharePoint sites
   - `GroupMember.Read.All` - Read group memberships
   - `Mail.Send` - Send mail as the user (for notifications)
   - `ChannelMessage.Send` - Send messages to Teams channels (optional)
4. Click **Grant admin consent for [Your Organization]**

### Step 4: Note Your IDs

Record these values for later:
```
NEXT_PUBLIC_CLIENT_ID=<Application (client) ID>
NEXT_PUBLIC_TENANT_ID=<Directory (tenant) ID>
```

---

## SharePoint Site Setup

### Step 1: Create the SharePoint Site

1. Go to [SharePoint Admin Center](https://admin.microsoft.com/sharepoint)
2. Create a new **Team site** or **Communication site**
   - Recommended name: `helpdesk`
   - URL will be: `https://yourtenant.sharepoint.com/sites/helpdesk`

### Step 2: Get the Site ID

1. Navigate to your SharePoint site
2. Open browser developer tools (F12)
3. Go to Console and run:
   ```javascript
   _spPageContextInfo.siteId
   ```
4. Or use Graph Explorer:
   ```
   GET https://graph.microsoft.com/v1.0/sites/yourtenant.sharepoint.com:/sites/helpdesk
   ```
5. The Site ID format is: `yourtenant.sharepoint.com,<site-guid>,<web-guid>`

Record:
```
NEXT_PUBLIC_SHAREPOINT_SITE_ID=yourtenant.sharepoint.com,<site-guid>,<web-guid>
NEXT_PUBLIC_SHAREPOINT_SITE_URL=https://yourtenant.sharepoint.com/sites/helpdesk
```

### Step 3: Create the Tickets List

1. Go to **Site Contents** → **+ New** → **List**
2. Name: `Tickets`
3. Add columns (create as specified types):

| Column Name | Type | Required | Notes |
|-------------|------|----------|-------|
| Title | Single line of text | Yes | Default column |
| Description | Multiple lines of text | No | Plain text |
| Status | Choice | No | New, In Progress, On Hold, Resolved, Closed |
| Priority | Choice | No | Low, Normal, High, Urgent |
| Category | Choice | No | Request, Problem |
| ProblemType | Single line of text | No | Department |
| ProblemTypeSub | Single line of text | No | Sub-category |
| ProblemTypeSub2 | Single line of text | No | Specific type |
| Location | Single line of text | No | |
| RequesterId | Single line of text | No | User's Entra ID |
| RequesterName | Single line of text | No | Display name |
| RequesterEmail | Single line of text | No | Email address |
| AssignedToId | Single line of text | No | Assignee's Entra ID |
| AssignedToName | Single line of text | No | Assignee display name |
| AssignedToEmail | Single line of text | No | Assignee email |
| DueDate | Date and Time | No | |
| ApprovalStatus | Choice | No | None, Pending, Approved, Denied, ChangesRequested |
| ApprovalRequestedBy | Single line of text | No | |
| ApprovalRequestedAt | Date and Time | No | |
| ApprovalDecisionBy | Single line of text | No | |
| ApprovalDecisionAt | Date and Time | No | |
| ApprovalNotes | Multiple lines of text | No | |

4. Get the list ID from **List Settings** URL
5. Record: `NEXT_PUBLIC_TICKETS_LIST_ID=<list-guid>`

### Step 4: Create the TicketComments List

1. Create a new list named `TicketComments`
2. Add columns:

| Column Name | Type | Required |
|-------------|------|----------|
| Title | Single line of text | Yes |
| TicketId | Number | No |
| CommentText | Multiple lines of text | No |
| AuthorId | Single line of text | No |
| AuthorName | Single line of text | No |
| AuthorEmail | Single line of text | No |
| IsInternal | Yes/No | No |
| IsSystemGenerated | Yes/No | No |

3. Record: `NEXT_PUBLIC_COMMENTS_LIST_ID=<list-guid>`

### Step 5: Create Additional Lists (Optional - Can Be Created via App)

The following lists can be created through the app's Settings page, or manually:

#### RBACGroups List
For role-based access control configuration.

| Column Name | Type | Notes |
|-------------|------|-------|
| Title | Single line of text | Group name |
| GroupId | Single line of text | Entra ID group GUID |
| GroupType | Choice | admin, department, subtype, visibility |
| Department | Single line of text | For department/subtype groups |
| SubCategory | Single line of text | For subtype groups |
| IsActive | Yes/No | Enable/disable |

#### AutoAssignRules List
For automatic ticket assignment.

| Column Name | Type |
|-------------|------|
| Title | Single line of text |
| Department | Single line of text |
| SubCategory | Single line of text |
| SpecificType | Single line of text |
| Category | Choice (Request, Problem) |
| Priority | Choice (Low, Normal, High, Urgent) |
| AssignToEmail | Single line of text |
| SortOrder | Number |
| IsActive | Yes/No |

#### EscalationRules List
For ticket escalation configuration.

| Column Name | Type |
|-------------|------|
| Title | Single line of text |
| TriggerType | Choice |
| TriggerHours | Number |
| Conditions | Multiple lines of text (JSON) |
| Actions | Multiple lines of text (JSON) |
| SortOrder | Number |
| IsActive | Yes/No |

#### ActivityLog List
For audit trail.

| Column Name | Type |
|-------------|------|
| Title | Single line of text |
| EventType | Single line of text |
| TicketId | Number |
| Actor | Single line of text |
| ActorEmail | Single line of text |
| Details | Multiple lines of text |
| Metadata | Multiple lines of text |

---

## GitHub Repository Setup

### Step 1: Clone or Fork the Repository

```bash
git clone https://github.com/spsvent/helpdesk-webui.git
cd helpdesk-webui
```

### Step 2: Create Local Environment File

Create `.env.local` with your configuration:

```bash
# Azure AD App Registration
NEXT_PUBLIC_CLIENT_ID=your-client-id
NEXT_PUBLIC_TENANT_ID=your-tenant-id

# SharePoint Configuration
NEXT_PUBLIC_SHAREPOINT_SITE_ID=yourtenant.sharepoint.com,site-guid,web-guid
NEXT_PUBLIC_SHAREPOINT_SITE_URL=https://yourtenant.sharepoint.com/sites/helpdesk

# SharePoint List IDs
NEXT_PUBLIC_TICKETS_LIST_ID=tickets-list-guid
NEXT_PUBLIC_COMMENTS_LIST_ID=comments-list-guid
NEXT_PUBLIC_RBAC_GROUPS_LIST_ID=rbac-list-guid
NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID=auto-assign-list-guid
NEXT_PUBLIC_ESCALATION_LIST_ID=escalation-list-guid
NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID=activity-log-list-guid

# Admin Configuration
NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID=admin-group-guid
NEXT_PUBLIC_ADMIN_EMAILS=admin@yourdomain.com

# App URL
NEXT_PUBLIC_APP_URL=https://your-production-url.com

# Azure Functions (add after setting up functions)
NEXT_PUBLIC_EMAIL_FUNCTION_URL=https://your-func.azurewebsites.net/api/sendemail?code=...
NEXT_PUBLIC_ESCALATION_FUNCTION_URL=https://your-func.azurewebsites.net/api/runEscalationCheck?code=...
```

### Step 3: Test Locally

```bash
npm install
npm run dev
```

Navigate to `http://localhost:3000` and verify the app loads and you can sign in.

---

## Azure Static Web App Deployment

### Step 1: Create Azure Static Web App

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **+ Create a resource** → Search "Static Web App"
3. Click **Create**
4. Configure:
   - **Subscription**: Your subscription
   - **Resource Group**: Create new or use existing
   - **Name**: `skypark-helpdesk` (or your preferred name)
   - **Plan type**: Free (or Standard for custom domains)
   - **Region**: Choose closest region
   - **Source**: GitHub
5. Click **Sign in with GitHub** and authorize
6. Select:
   - **Organization**: Your GitHub org
   - **Repository**: Your forked/cloned repo
   - **Branch**: `main`
7. Build Details:
   - **Build Presets**: Custom
   - **App location**: `/`
   - **Api location**: (leave empty)
   - **Output location**: `out`
8. Click **Review + create** → **Create**

### Step 2: Configure GitHub Secrets

After deployment, Azure creates a GitHub Actions workflow. Add these secrets to your repository:

1. Go to GitHub → Your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:

| Secret Name | Value |
|-------------|-------|
| `NEXT_PUBLIC_EMAIL_FUNCTION_URL` | Your Azure Function URL with code |
| `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` | Your Azure Function URL with code |

### Step 3: Update GitHub Actions Workflow

Edit `.github/workflows/azure-static-web-apps-*.yml`:

```yaml
env:
  # Build-time environment variables
  NEXT_PUBLIC_CLIENT_ID: "your-client-id"
  NEXT_PUBLIC_TENANT_ID: "your-tenant-id"
  NEXT_PUBLIC_SHAREPOINT_SITE_ID: "your-site-id"
  NEXT_PUBLIC_SHAREPOINT_SITE_URL: "https://yourtenant.sharepoint.com/sites/helpdesk"
  NEXT_PUBLIC_TICKETS_LIST_ID: "tickets-list-guid"
  NEXT_PUBLIC_COMMENTS_LIST_ID: "comments-list-guid"
  NEXT_PUBLIC_RBAC_GROUPS_LIST_ID: "rbac-list-guid"
  NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID: "auto-assign-list-guid"
  NEXT_PUBLIC_ESCALATION_LIST_ID: "escalation-list-guid"
  NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID: "activity-log-list-guid"
  NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID: "admin-group-guid"
  NEXT_PUBLIC_APP_URL: "https://your-production-url.com"
  # Secrets (stored in GitHub Secrets)
  NEXT_PUBLIC_EMAIL_FUNCTION_URL: ${{ secrets.NEXT_PUBLIC_EMAIL_FUNCTION_URL }}
  NEXT_PUBLIC_ESCALATION_FUNCTION_URL: ${{ secrets.NEXT_PUBLIC_ESCALATION_FUNCTION_URL }}
```

### Step 4: Add Production Redirect URI

1. Go back to Azure AD → App registrations → Your app → **Authentication**
2. Add your production URL as a redirect URI:
   - `https://your-app-name.azurestaticapps.net`
   - Or your custom domain if configured

### Step 5: Trigger Deployment

```bash
git add .
git commit -m "Configure environment variables"
git push
```

Monitor the deployment in GitHub Actions.

---

## Azure Functions Setup

The Help Desk uses Azure Functions for:
- Sending email notifications from a shared mailbox
- Running scheduled escalation checks

### Step 1: Create Azure Function App

1. Go to Azure Portal → **+ Create a resource** → **Function App**
2. Configure:
   - **Function App name**: `helpdesk-email-func`
   - **Runtime stack**: Node.js 18
   - **Region**: Same as Static Web App
   - **Plan type**: Consumption (Serverless)
3. Create the function app

### Step 2: Deploy Functions

The functions are in the `azure-functions/` directory. Deploy using VS Code Azure extension or Azure CLI:

```bash
cd azure-functions
func azure functionapp publish helpdesk-email-func
```

### Step 3: Configure Function App Settings

In Azure Portal → Function App → **Configuration** → **Application settings**, add:

| Setting | Value |
|---------|-------|
| `TENANT_ID` | Your Azure AD tenant ID |
| `CLIENT_ID` | Your Azure AD app client ID |
| `CLIENT_SECRET` | Create in App Registration → Certificates & secrets |
| `SHAREPOINT_SITE_ID` | Your SharePoint site ID |
| `TICKETS_LIST_ID` | Your Tickets list GUID |
| `SHARED_MAILBOX` | support@yourdomain.com |
| `APP_URL` | https://your-production-url.com |

### Step 4: Get Function URLs

1. Go to each function in Azure Portal
2. Click **Get Function URL**
3. Copy the URL (includes the function key)
4. Add to GitHub Secrets as shown above

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CLIENT_ID` | Azure AD app client ID | `06fcde50-24bf-...` |
| `NEXT_PUBLIC_TENANT_ID` | Azure AD tenant ID | `f0db97c1-2010-...` |
| `NEXT_PUBLIC_SHAREPOINT_SITE_ID` | SharePoint site identifier | `tenant.sharepoint.com,guid,guid` |
| `NEXT_PUBLIC_TICKETS_LIST_ID` | Tickets list GUID | `018f0d5c-318d-...` |
| `NEXT_PUBLIC_COMMENTS_LIST_ID` | Comments list GUID | `70713696-fd57-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_RBAC_GROUPS_LIST_ID` | RBAC configuration list | Falls back to code config |
| `NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID` | Auto-assign rules list | Falls back to code config |
| `NEXT_PUBLIC_ESCALATION_LIST_ID` | Escalation rules list | Disabled |
| `NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID` | Activity log list | Disabled |
| `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED` | Enable Teams notifications | `false` |
| `NEXT_PUBLIC_ADMIN_EMAILS` | Comma-separated admin emails | Empty |

---

## Post-Deployment Configuration

### 1. Create Admin Group

1. Go to Azure AD → **Groups** → **+ New group**
2. Create a Security group for administrators (e.g., "GeneralManagers")
3. Add admin users as members
4. Copy the **Object ID**
5. Set as `NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID`

### 2. Configure RBAC Groups

Access the app → **Settings** → **Visibility Groups** to configure:
- Which Entra ID groups can see each other's tickets
- Department-based support staff groups

### 3. Set Up Auto-Assignment Rules

Access the app → **Settings** → **Auto-Assign Rules** to configure:
- Default assignees per department
- Priority-based routing

### 4. Configure Escalation Rules

Access the app → **Settings** → **Escalation Rules** to configure:
- Time-based escalations
- Priority escalation rules

### 5. Set Up Custom Domain (Optional)

1. In Azure Portal → Static Web App → **Custom domains**
2. Add your domain and verify ownership
3. Update Azure AD redirect URIs
4. Update `NEXT_PUBLIC_APP_URL`

---

## Troubleshooting

### "List not found" Errors

1. Verify the list ID is correct (check SharePoint List Settings URL)
2. Ensure the environment variable is set in GitHub Actions workflow
3. Trigger a rebuild: `git commit --allow-empty -m "Rebuild" && git push`

### Authentication Errors

1. Verify redirect URIs match exactly (including trailing slashes)
2. Check API permissions are granted admin consent
3. Ensure the app registration is in the correct tenant

### SharePoint Permission Errors

1. Verify `Sites.ReadWrite.All` permission is granted
2. Check the user has access to the SharePoint site
3. Verify the Site ID format is correct

### Build Failures

1. Check GitHub Actions logs for errors
2. Verify all environment variables are set
3. Ensure secrets don't contain special characters that need escaping

### Function App Errors

1. Check Application Insights logs
2. Verify all application settings are configured
3. Test functions locally with `func start`

---

## Support

For issues or questions:
- Check the in-app Help documentation
- Review the `CLAUDE.md` file for development guidelines
- Open an issue on the GitHub repository
