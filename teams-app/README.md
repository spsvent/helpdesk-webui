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

## Azure AD Configuration

For SSO to work seamlessly, ensure your Azure AD app registration has:

1. **Redirect URIs** include:
   - `https://tickets.spsvent.net`
   - `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`

2. **API permissions** include:
   - Microsoft Graph: User.Read, Sites.ReadWrite.All, etc.

3. **Expose an API** with:
   - Application ID URI: `api://tickets.spsvent.net/06fcde50-24bf-4d53-838d-ecc035653d8f`
   - Scope: `access_as_user`

4. **Authorized client applications** (for Teams SSO):
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
