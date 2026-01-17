# Azure AD App Registration for Web UI

## Step 1: Create New App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **+ New registration**

### Registration Details:
- **Name**: `SkyPark Helpdesk Web UI`
- **Supported account types**: `Accounts in this organizational directory only (Single tenant)`
- **Redirect URI**:
  - Platform: **Single-page application**
  - URI: `http://localhost:3000`

4. Click **Register**

## Step 2: Note the Application (Client) ID

After registration, copy the **Application (client) ID** from the Overview page.

```
Example: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Save this value** - you'll add it to `.env.local` later.

## Step 3: Add API Permissions

1. Go to **API permissions** in the left menu
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add these permissions:
   - `User.Read` (Sign in and read user profile)
   - `Sites.ReadWrite.All` (Read and write items in all site collections)
   - `User.ReadBasic.All` (Read all users' basic profiles)

6. Click **Add permissions**
7. Click **Grant admin consent for [Your Tenant]** (requires admin)

## Step 4: Add Production Redirect URI (Later)

After you deploy to Azure Static Web Apps, add the production URI:

1. Go to **Authentication** in the left menu
2. Under **Single-page application** redirect URIs, add:
   - `https://your-app-name.azurestaticapps.net`

## Step 5: Update .env.local

Copy `.env.local.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_CLIENT_ID=your-client-id-here
NEXT_PUBLIC_TENANT_ID=f0db97c1-2010-4d0c-826e-d6e0f2b25f2f
```

## Verification

The app registration is complete when:
- [ ] App is registered with SPA platform type
- [ ] Client ID is copied
- [ ] API permissions are granted (admin consent given)
- [ ] `.env.local` is configured

## Reference

- Tenant ID: `f0db97c1-2010-4d0c-826e-d6e0f2b25f2f`
- SharePoint Site: `https://skyparksv.sharepoint.com/sites/helpdesk`
