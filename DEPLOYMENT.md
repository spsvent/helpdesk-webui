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
- [ ] Azure Functions Core Tools (`npm install -g azure-functions-core-tools@4`)

---

## Azure AD App Registration

### Step 1: Create the App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** → **App registrations**
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
   - [x] Access tokens
   - [x] ID tokens
4. Click **Save**

### Step 3: Configure API Permissions (Delegated)

These permissions are used by the web app when users are signed in:

1. Go to **API permissions**
2. Click **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `User.Read` - Sign in and read user profile
   - `User.Read.All` - Read all users' full profiles (for user search)
   - `Sites.ReadWrite.All` - Read and write SharePoint sites
   - `Sites.Manage.All` - Create and manage SharePoint lists
   - `GroupMember.Read.All` - Read group memberships (for RBAC)
   - `Mail.Send` - Send mail as the user (for notifications)
   - `ChannelMessage.Send` - Send messages to Teams channels (optional)
4. Click **Grant admin consent for [Your Organization]**

### Step 4: Configure API Permissions (Application) for Azure Functions

These permissions are used by Azure Functions for background operations:

1. Still in **API permissions**, click **+ Add a permission** → **Microsoft Graph** → **Application permissions**
2. Add these permissions:
   - `Mail.Send` - Send mail as any user (for shared mailbox)
   - `Sites.ReadWrite.All` - Read/write SharePoint (for escalation function)
3. Click **Grant admin consent for [Your Organization]**

### Step 5: Create Client Secret (for Azure Functions)

1. Go to **Certificates & secrets** in the left sidebar
2. Click **+ New client secret**
3. Enter a description (e.g., "Azure Functions")
4. Select an expiration period (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT: Copy the secret value immediately** - you won't be able to see it again!
7. Store this as `AZURE_CLIENT_SECRET` for Azure Functions

### Step 6: Note Your IDs

Record these values for later:
```
NEXT_PUBLIC_CLIENT_ID=<Application (client) ID>
NEXT_PUBLIC_TENANT_ID=<Directory (tenant) ID>
AZURE_CLIENT_SECRET=<Client secret value>
```

---

## SharePoint Site Setup

### Step 1: Create the SharePoint Site

1. Go to SharePoint or create a new site from Microsoft 365
2. Create a new **Team site** or **Communication site**
   - Recommended name: `helpdesk`
   - URL will be: `https://yourtenant.sharepoint.com/sites/helpdesk`

### Step 2: Get the Site ID

Use Microsoft Graph Explorer to get the full site ID:

1. Go to [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer)
2. Sign in with your Microsoft 365 account
3. Run this query (replace with your tenant and site name):
   ```
   GET https://graph.microsoft.com/v1.0/sites/yourtenant.sharepoint.com:/sites/helpdesk
   ```
4. From the response, combine these values:
   - `siteCollection.hostname` + `,` + `id` (the site GUID) + `,` + look for the web ID

   The format is: `yourtenant.sharepoint.com,<site-guid>,<web-guid>`

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
| Title | Single line of text | Yes | Default column (ticket title) |
| Description | Multiple lines of text | No | Plain text |
| TicketNumber | Number | No | Auto-generated ticket number |
| Status | Choice | No | New, In Progress, On Hold, Resolved, Closed |
| Priority | Choice | No | Low, Normal, High, Urgent |
| Category | Choice | No | Request, Problem |
| ProblemType | Single line of text | No | Department (Tech, Operations, etc.) |
| ProblemTypeSub | Single line of text | No | Sub-category |
| ProblemTypeSub2 | Single line of text | No | Specific type |
| Location | Single line of text | No | |
| DueDate | Date and Time | No | |
| EscalatedAt | Date and Time | No | Set when ticket is escalated |
| OriginalRequester | Single line of text | No | For migrated tickets |
| OriginalAssignedTo | Single line of text | No | For migrated tickets |
| ApprovalStatus | Choice | No | None, Pending, Approved, Denied, Changes Requested |
| ApprovalRequestedDate | Date and Time | No | |
| ApprovalDate | Date and Time | No | |
| ApprovalNotes | Multiple lines of text | No | |

**Note**: The `AssignedTo`, `Requester`, `ApprovalRequestedBy`, and `ApprovedBy` fields are created automatically by SharePoint as Person/Lookup columns when you reference users.

4. Get the list ID from **List Settings** URL (look for `List=%7B...%7D` and decode the GUID)
5. Record: `NEXT_PUBLIC_TICKETS_LIST_ID=<list-guid>`

### Step 4: Create the TicketComments List

1. Create a new list named `TicketComments`
2. Add columns:

| Column Name | Type | Required | Notes |
|-------------|------|----------|-------|
| Title | Single line of text | Yes | Comment preview |
| TicketID | Number | No | References ticket ID |
| Body | Multiple lines of text | No | Comment content (legacy) |
| CommentBody | Multiple lines of text | No | Comment content (preferred) |
| IsInternal | Yes/No | No | Staff-only note |
| CommentType | Choice | No | Comment, Status Change, Assignment, Resolution, Note, Approval |
| OriginalAuthor | Single line of text | No | For migrated comments |
| OriginalCreated | Single line of text | No | For migrated comments |

3. Record: `NEXT_PUBLIC_COMMENTS_LIST_ID=<list-guid>`

### Step 5: Create Additional Lists (Optional - Can Be Created via App)

The following lists can be created through the app's Settings page, which will automatically create the correct columns. Or you can create them manually:

#### RBACGroups List
For role-based access control configuration.

| Column Name | Type | Notes |
|-------------|------|-------|
| Title | Single line of text | Group name |
| GroupId | Single line of text | Entra ID group GUID |
| GroupType | Choice | admin, department, visibility |
| Department | Single line of text | For department groups (matches ProblemType) |
| ProblemTypeSub | Single line of text | For subtype restrictions |
| IsActive | Yes/No | Enable/disable |

#### AutoAssignRules List
For automatic ticket assignment. **Best created via Settings page.**

| Column Name | Type | Notes |
|-------------|------|-------|
| Title | Single line of text | Rule name |
| Department | Single line of text | Matches ProblemType |
| SubCategory | Single line of text | Matches ProblemTypeSub |
| SpecificType | Single line of text | Matches ProblemTypeSub2 |
| Category | Choice | Request, Problem |
| Priority | Choice | Low, Normal, High, Urgent |
| AssignToEmail | Single line of text | Email of assignee (required) |
| SortOrder | Number | Lower = higher priority (default 100) |
| IsActive | Yes/No | Enable/disable (default Yes) |

#### EscalationRules List
For ticket escalation configuration. **Best created via Settings page.**

| Column Name | Type | Notes |
|-------------|------|-------|
| Title | Single line of text | Rule name |
| TriggerType | Choice | no_response, no_update, approaching_sla |
| TriggerHours | Number | Hours before trigger (default 24) |
| MatchPriority | Choice | Low, Normal, High, Urgent (optional filter) |
| MatchStatus | Choice | New, In Progress, Pending Approval, On Hold (optional filter) |
| MatchDepartment | Single line of text | Optional ProblemType filter |
| ActionType | Choice | escalate_priority, reassign, notify, escalate_and_notify |
| EscalateToPriority | Choice | Normal, High, Urgent |
| NotifyEmail | Single line of text | Email to notify |
| ReassignToEmail | Single line of text | Email to reassign to |
| SortOrder | Number | Lower = higher priority (default 100) |
| IsActive | Yes/No | Enable/disable (default Yes) |

#### ActivityLog List
For audit trail. **Best created via Settings page.**

| Column Name | Type | Notes |
|-------------|------|-------|
| Title | Single line of text | Event description |
| EventType | Choice | ticket_created, ticket_updated, ticket_status_changed, ticket_priority_changed, ticket_assigned, ticket_escalated, comment_added, email_sent, approval_requested, approval_approved, approval_rejected, escalation_triggered |
| TicketId | Single line of text | SharePoint item ID |
| TicketNumber | Single line of text | Ticket number |
| Actor | Single line of text | Email of who performed action |
| ActorName | Single line of text | Display name |
| Details | Multiple lines of text | JSON metadata |

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

# SharePoint List IDs (required)
NEXT_PUBLIC_TICKETS_LIST_ID=tickets-list-guid
NEXT_PUBLIC_COMMENTS_LIST_ID=comments-list-guid

# SharePoint List IDs (optional - create via Settings page)
NEXT_PUBLIC_RBAC_GROUPS_LIST_ID=
NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID=
NEXT_PUBLIC_ESCALATION_LIST_ID=
NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID=

# Admin Configuration
NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID=admin-group-guid
NEXT_PUBLIC_ADMIN_EMAILS=admin@yourdomain.com

# App URL
NEXT_PUBLIC_APP_URL=https://your-production-url.com

# Azure Functions (add after setting up functions)
NEXT_PUBLIC_EMAIL_FUNCTION_URL=
NEXT_PUBLIC_ESCALATION_FUNCTION_URL=
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
| `NEXT_PUBLIC_COMMENTS_LIST_ID` | Your Comments list GUID |
| `NEXT_PUBLIC_EMAIL_FUNCTION_URL` | Your Azure Function URL with code |
| `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` | Your Azure Function URL with code |

### Step 3: Update GitHub Actions Workflow

Edit `.github/workflows/azure-static-web-apps-*.yml` and add the `env` section under the build step:

```yaml
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          # ... existing config ...
        env:
          # Build-time environment variables
          NEXT_PUBLIC_CLIENT_ID: "your-client-id"
          NEXT_PUBLIC_TENANT_ID: "your-tenant-id"
          NEXT_PUBLIC_SHAREPOINT_SITE_ID: "your-site-id"
          NEXT_PUBLIC_SHAREPOINT_SITE_URL: "https://yourtenant.sharepoint.com/sites/helpdesk"
          NEXT_PUBLIC_TICKETS_LIST_ID: "tickets-list-guid"
          NEXT_PUBLIC_COMMENTS_LIST_ID: ${{ secrets.NEXT_PUBLIC_COMMENTS_LIST_ID }}
          NEXT_PUBLIC_RBAC_GROUPS_LIST_ID: "rbac-list-guid"
          NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID: "auto-assign-list-guid"
          NEXT_PUBLIC_ESCALATION_LIST_ID: "escalation-list-guid"
          NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID: "activity-log-list-guid"
          NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID: "admin-group-guid"
          NEXT_PUBLIC_APP_URL: "https://your-production-url.com"
          # Secrets (stored in GitHub Secrets - contain API keys)
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

The functions are in the `azure-functions/` directory.

```bash
cd azure-functions
npm install
func azure functionapp publish helpdesk-email-func
```

### Step 3: Configure Function App Settings

In Azure Portal → Function App → **Configuration** → **Application settings**, add:

| Setting | Value | Notes |
|---------|-------|-------|
| `AZURE_CLIENT_ID` | Your Azure AD app client ID | Same as NEXT_PUBLIC_CLIENT_ID |
| `AZURE_TENANT_ID` | Your Azure AD tenant ID | Same as NEXT_PUBLIC_TENANT_ID |
| `AZURE_CLIENT_SECRET` | Your client secret | Created in Step 5 of App Registration |
| `SENDER_EMAIL` | support@yourdomain.com | Shared mailbox for sending emails |
| `SHAREPOINT_SITE_ID` | Your SharePoint site ID | Same as NEXT_PUBLIC_SHAREPOINT_SITE_ID |
| `TICKETS_LIST_ID` | Your Tickets list GUID | Same as NEXT_PUBLIC_TICKETS_LIST_ID |
| `COMMENTS_LIST_ID` | Your Comments list GUID | Same as NEXT_PUBLIC_COMMENTS_LIST_ID |
| `ESCALATION_LIST_ID` | Your Escalation list GUID | Same as NEXT_PUBLIC_ESCALATION_LIST_ID |
| `ACTIVITY_LOG_LIST_ID` | Your Activity Log list GUID | Optional |
| `APP_URL` | https://your-production-url.com | For email links |

### Step 4: Configure Shared Mailbox (for email sending)

For the Azure Function to send emails from a shared mailbox:

1. Create a shared mailbox in Microsoft 365 Admin Center
2. The app registration needs `Mail.Send` **Application** permission
3. Set the `SENDER_EMAIL` to the shared mailbox address

### Step 5: Get Function URLs

1. Go to each function in Azure Portal
2. Click **Get Function URL**
3. Copy the URL (includes the function key)
4. Add to GitHub Secrets:
   - `NEXT_PUBLIC_EMAIL_FUNCTION_URL`
   - `NEXT_PUBLIC_ESCALATION_FUNCTION_URL`

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CLIENT_ID` | Azure AD app client ID | `06fcde50-24bf-...` |
| `NEXT_PUBLIC_TENANT_ID` | Azure AD tenant ID | `f0db97c1-2010-...` |
| `NEXT_PUBLIC_SHAREPOINT_SITE_ID` | SharePoint site identifier | `tenant.sharepoint.com,guid,guid` |
| `NEXT_PUBLIC_SHAREPOINT_SITE_URL` | SharePoint site URL | `https://tenant.sharepoint.com/sites/helpdesk` |
| `NEXT_PUBLIC_TICKETS_LIST_ID` | Tickets list GUID | `018f0d5c-318d-...` |
| `NEXT_PUBLIC_COMMENTS_LIST_ID` | Comments list GUID | `70713696-fd57-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_RBAC_GROUPS_LIST_ID` | RBAC configuration list | Falls back to code config |
| `NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID` | Auto-assign rules list | Falls back to code config |
| `NEXT_PUBLIC_ESCALATION_LIST_ID` | Escalation rules list | Disabled |
| `NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID` | Activity log list | Disabled |
| `NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID` | Admin Entra group ID | Required for approvals |
| `NEXT_PUBLIC_ADMIN_EMAILS` | Comma-separated admin emails | Empty |
| `NEXT_PUBLIC_APP_URL` | Production app URL | Used in email links |
| `NEXT_PUBLIC_EMAIL_FUNCTION_URL` | Azure Function for emails | Disabled |
| `NEXT_PUBLIC_ESCALATION_FUNCTION_URL` | Azure Function for escalations | Disabled |
| `NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED` | Enable Teams notifications | `false` |

---

## Post-Deployment Configuration

### 1. Create Admin Group

1. Go to Azure AD → **Groups** → **+ New group**
2. Create a Security group for administrators (e.g., "GeneralManagers")
3. Add admin users as members
4. Copy the **Object ID**
5. Set as `NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID`

### 2. Create Lists via Settings Page

Once the app is running, use the Settings page to create optional lists:

1. Sign in as an admin
2. Go to **Settings** (gear icon)
3. For each section (Auto-Assign Rules, Escalation Rules, Activity Log):
   - Click "Create List" if the list doesn't exist
   - Copy the list ID shown
   - Add to GitHub Actions workflow
   - Commit and push to rebuild

### 3. Configure RBAC Groups

Access the app → **Settings** → **Visibility Groups** to configure:
- Which Entra ID groups can see each other's tickets
- Department-based support staff groups

### 4. Set Up Auto-Assignment Rules

Access the app → **Settings** → **Auto-Assign Rules** to configure:
- Default assignees per department
- Priority-based routing

### 5. Configure Escalation Rules

Access the app → **Settings** → **Escalation Rules** to configure:
- Time-based escalations
- Priority escalation rules

### 6. Set Up Custom Domain (Optional)

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
4. Clear browser cache and sign out/in

### Authentication Errors

1. Verify redirect URIs match exactly (including trailing slashes)
2. Check API permissions are granted admin consent
3. Ensure the app registration is in the correct tenant
4. Try signing out and back in

### SharePoint Permission Errors

1. Verify `Sites.ReadWrite.All` and `Sites.Manage.All` permissions are granted
2. Check the user has access to the SharePoint site
3. Verify the Site ID format is correct (three parts separated by commas)

### Build Failures

1. Check GitHub Actions logs for errors
2. Verify all environment variables are set
3. Ensure secrets don't contain special characters that need escaping
4. Check that the workflow file YAML is valid

### Function App Errors

1. Check Application Insights or Log Stream in Azure Portal
2. Verify all application settings are configured
3. Ensure `AZURE_CLIENT_SECRET` is valid and not expired
4. Check that Application permissions have admin consent
5. Test functions locally with `func start`

### Email Not Sending

1. Verify `Mail.Send` Application permission is granted
2. Check the shared mailbox exists and is accessible
3. Verify `SENDER_EMAIL` matches the shared mailbox address
4. Check Function App logs for specific errors

---

## Microsoft Teams App Setup

The Help Desk can be embedded in Microsoft Teams as a tab app with Single Sign-On (SSO).

### Step 1: Configure Azure AD for Teams SSO

#### 1.1 Expose an API

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations**
2. Select your Help Desk app registration
3. Click **Expose an API** in the left sidebar
4. Click **Set** next to "Application ID URI"
5. Set the URI to: `api://tickets.spsvent.net/<your-client-id>`
   - Replace `tickets.spsvent.net` with your production domain
   - Replace `<your-client-id>` with your Application (client) ID
6. Click **Save**

#### 1.2 Add a Scope

1. On **Expose an API**, click **+ Add a scope**
2. Configure:
   - **Scope name**: `access_as_user`
   - **Who can consent?**: Admins and users
   - **Admin consent display name**: `Access Help Desk as user`
   - **Admin consent description**: `Allows Teams to access Help Desk on behalf of the signed-in user`
   - **User consent display name**: `Access Help Desk`
   - **User consent description**: `Allows Teams to access Help Desk on your behalf`
   - **State**: Enabled
3. Click **Add scope**

#### 1.3 Authorize Teams Client Applications

1. On **Expose an API**, scroll to **Authorized client applications**
2. Click **+ Add a client application**
3. Add **Teams desktop/mobile**:
   - **Client ID**: `1fec8e78-bce4-4aaf-ab1b-5451cc387264`
   - Check the box next to your `access_as_user` scope
   - Click **Add application**
4. Add **Teams web**:
   - **Client ID**: `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`
   - Check the box next to your `access_as_user` scope
   - Click **Add application**

### Step 2: Build and Upload the Teams App Package

1. Navigate to the `teams-app/` directory
2. Edit `manifest.json` if needed:
   - Update `id` to match your Azure AD app client ID
   - Update `webApplicationInfo.id` and `webApplicationInfo.resource`
   - Update domain URLs
3. Create the app package:
   ```bash
   cd teams-app
   zip -r helpdesk-teams-app.zip manifest.json color.png outline.png
   ```

### Step 3: Deploy to Microsoft Teams

#### Option A: Teams Admin Center (Organization-wide)

1. Go to [Teams Admin Center](https://admin.teams.microsoft.com)
2. Navigate to **Teams apps** → **Manage apps**
3. Click **+ Upload new app**
4. Select your `helpdesk-teams-app.zip`
5. The app will be available to all users in your organization

#### Option B: Sideload for Testing

1. In Teams, click **Apps** in the left sidebar
2. Click **Manage your apps** → **Upload an app**
3. Select **Upload a custom app**
4. Upload `helpdesk-teams-app.zip`

### Step 4: Add as Channel Tab

1. In Teams, navigate to any channel
2. Click **+** to add a tab
3. Search for "Help Desk" and select it
4. Click **Save** to add the tab
5. Users will be automatically signed in via SSO

### Teams SSO Troubleshooting

**"Unable to get auth token" error:**
- Verify the Application ID URI matches the manifest's `webApplicationInfo.resource`
- Ensure both Teams client IDs are authorized
- Check that admin consent was granted for API permissions

**Save button greyed out when adding tab:**
- Ensure the app is deployed and `/teams-config` page is accessible
- Check browser console for Teams SDK errors
- Verify `validDomains` in manifest.json includes your domain

**Login page still appears in Teams:**
- SSO requires the Azure AD app to be properly configured
- Check that `access_as_user` scope exists and is authorized
- Verify the user has consented to the app permissions

---

## Support

For issues or questions:
- Check the in-app Help documentation
- Review the `CLAUDE.md` file for development guidelines
- Review the `azure-functions/README.md` for function-specific setup
- Open an issue on the GitHub repository
