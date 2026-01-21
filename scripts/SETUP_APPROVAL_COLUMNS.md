# Approval Workflow - SharePoint Column Setup

This guide walks you through adding the required SharePoint columns for the approval workflow feature.

## Option 1: Manual Setup (Recommended)

### Step 1: Open SharePoint List Settings

1. Go to your SharePoint site: https://skyparksv.sharepoint.com/sites/helpdesk
2. Navigate to **Site Contents** → **Tickets** list
3. Click the **gear icon** (⚙️) → **List settings**

### Step 2: Add the Columns

Click **"Create column"** for each of the following:

#### Column 1: ApprovalStatus
- **Name:** `ApprovalStatus`
- **Type:** Choice
- **Choices:** (one per line)
  ```
  None
  Pending
  Approved
  Denied
  Changes Requested
  ```
- **Default value:** `None`
- **Display as:** Drop-down menu

#### Column 2: ApprovalRequestedBy
- **Name:** `ApprovalRequestedBy`
- **Type:** Person or Group
- **Allow multiple selections:** No
- **Show field:** Name (with presence)

#### Column 3: ApprovalRequestedDate
- **Name:** `ApprovalRequestedDate`
- **Type:** Date and Time
- **Date and Time Format:** Date & Time

#### Column 4: ApprovedBy
- **Name:** `ApprovedBy`
- **Type:** Person or Group
- **Allow multiple selections:** No
- **Show field:** Name (with presence)

#### Column 5: ApprovalDate
- **Name:** `ApprovalDate`
- **Type:** Date and Time
- **Date and Time Format:** Date & Time

#### Column 6: ApprovalNotes
- **Name:** `ApprovalNotes`
- **Type:** Multiple lines of text
- **Number of lines:** 6
- **Text type:** Plain text

---

## Option 2: Using SharePoint Modern UI

1. Open the Tickets list in SharePoint
2. Click **"+ Add column"** in the list header
3. For each column above:
   - Select the appropriate column type
   - Enter the name and configure settings
   - Click **Save**

---

## Option 3: Using Microsoft 365 CLI

If you have the [Microsoft 365 CLI](https://pnp.github.io/cli-microsoft365/) installed:

```bash
# Login first
m365 login

# Set variables
SITE_URL="https://skyparksv.sharepoint.com/sites/helpdesk"
LIST_NAME="Tickets"

# Add ApprovalStatus (Choice)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="Choice" DisplayName="ApprovalStatus" Required="FALSE" Format="Dropdown" FillInChoice="FALSE" StaticName="ApprovalStatus" Name="ApprovalStatus"><Default>None</Default><CHOICES><CHOICE>None</CHOICE><CHOICE>Pending</CHOICE><CHOICE>Approved</CHOICE><CHOICE>Denied</CHOICE><CHOICE>Changes Requested</CHOICE></CHOICES></Field>'

# Add ApprovalRequestedBy (Person)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="User" DisplayName="ApprovalRequestedBy" Required="FALSE" StaticName="ApprovalRequestedBy" Name="ApprovalRequestedBy" />'

# Add ApprovalRequestedDate (DateTime)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="DateTime" DisplayName="ApprovalRequestedDate" Required="FALSE" Format="DateTime" StaticName="ApprovalRequestedDate" Name="ApprovalRequestedDate" />'

# Add ApprovedBy (Person)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="User" DisplayName="ApprovedBy" Required="FALSE" StaticName="ApprovedBy" Name="ApprovedBy" />'

# Add ApprovalDate (DateTime)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="DateTime" DisplayName="ApprovalDate" Required="FALSE" Format="DateTime" StaticName="ApprovalDate" Name="ApprovalDate" />'

# Add ApprovalNotes (Multi-line text)
m365 spo field add --webUrl "$SITE_URL" --listTitle "$LIST_NAME" --xml '<Field Type="Note" DisplayName="ApprovalNotes" Required="FALSE" NumLines="6" RichText="FALSE" StaticName="ApprovalNotes" Name="ApprovalNotes" />'
```

---

## Environment Variables

After adding the columns, update your `.env.local` file:

```env
# Get this from Azure Portal > Azure AD > Groups > [Your Group] > Object ID
NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID=your-group-id-here

# Your app URL for email button links
NEXT_PUBLIC_APP_URL=https://lively-coast-062dfc51e.1.azurestaticapps.net
```

### Finding Your General Managers Group ID

1. Go to https://portal.azure.com
2. Navigate to **Azure Active Directory** → **Groups**
3. Search for your General Managers group
4. Click on it and copy the **Object ID**
   - Example: `12345678-1234-1234-1234-123456789abc`

---

## Verification

After setup, you can verify the columns exist by:
1. Opening a ticket in SharePoint
2. Clicking **Edit** on any item
3. Scrolling down to see the new approval fields

The Help Desk app will automatically use these columns when you request or process approvals.
