# SkyPark Help Desk - Teams App

This folder contains the Microsoft Teams app manifest for deploying Help Desk as a Teams app.

## Files

- `manifest.json` - Teams app manifest
- `color.svg` / `color.png` - 192x192 color icon
- `outline.svg` / `outline.png` - 32x32 outline icon (white on transparent)

## Convert SVG to PNG

If PNG files don't exist, convert the SVGs:

**Using ImageMagick:**
```bash
convert -background none -resize 192x192 color.svg color.png
convert -background none -resize 32x32 outline.svg outline.png
```

**Using Inkscape:**
```bash
inkscape color.svg -w 192 -h 192 -o color.png
inkscape outline.svg -w 32 -h 32 -o outline.png
```

**Or use an online tool:**
- https://svgtopng.com/

## Package the App

```bash
cd teams-app
zip -r helpdesk-teams-app.zip manifest.json color.png outline.png
```

## Deploy to Teams

### Option A: Upload to Teams Admin Center (Org-wide)

1. Go to https://admin.teams.microsoft.com
2. Navigate to **Teams apps** → **Manage apps**
3. Click **Upload new app**
4. Upload `helpdesk-teams-app.zip`
5. The app will be available to all users in your organization

### Option B: Sideload for Testing

1. In Teams, click **Apps** in the left sidebar
2. Click **Manage your apps** → **Upload an app**
3. Select **Upload a custom app**
4. Upload `helpdesk-teams-app.zip`

## App Features

Once installed, the app provides:

- **Personal app** with tabs for:
  - Tickets (main view)
  - New Ticket (quick access)
  - Help (documentation)

- **Channel tab** - Add to any Teams channel

## Azure AD Configuration for Teams SSO

For automatic sign-in (SSO) inside Teams, configure your Azure AD app:

### 1. Expose an API

1. Go to **Azure Portal** → **Entra ID** → **App registrations** → Your app
2. Click **Expose an API**
3. Set **Application ID URI** to:
   ```
   api://tickets.spsvent.net/06fcde50-24bf-4d53-838d-ecc035653d8f
   ```
   (Replace with your domain and client ID)

### 2. Add a Scope

1. Click **+ Add a scope**
2. Configure:
   - **Scope name**: `access_as_user`
   - **Who can consent?**: Admins and users
   - **Admin consent display name**: `Access Help Desk as user`
   - **Admin consent description**: `Allows Teams to access Help Desk on behalf of the signed-in user`
   - **State**: Enabled
3. Click **Add scope**

### 3. Authorize Teams Clients

1. Under **Authorized client applications**, click **+ Add a client application**
2. Add both Teams client IDs:
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
3. Check the `access_as_user` scope for each

### 4. Verify Redirect URIs

In **Authentication**, ensure these redirect URIs exist:
- `https://tickets.spsvent.net` (or your production URL)
- `http://localhost:3000` (for development)
