# =============================================================================
# Add Approval Workflow Columns to SharePoint Tickets List
# =============================================================================
# Prerequisites:
#   - PnP PowerShell module installed: Install-Module -Name PnP.PowerShell
#   - SharePoint admin or site owner permissions
#
# Usage:
#   .\add-approval-columns.ps1
#
# Authentication Options:
#   - Default: Uses device code flow (copy URL and code to browser)
#   - With ClientId: .\add-approval-columns.ps1 -ClientId "your-app-id"
#   - Web Login: .\add-approval-columns.ps1 -UseWebLogin
# =============================================================================

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk",
    [string]$ListName = "Tickets",
    [string]$ClientId = "",
    [switch]$UseWebLogin = $false
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " Approval Workflow - SharePoint Setup Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if PnP.PowerShell module is installed
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "ERROR: PnP.PowerShell module is not installed." -ForegroundColor Red
    Write-Host "Install it with: Install-Module -Name PnP.PowerShell -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

# Connect to SharePoint
Write-Host "Connecting to SharePoint site: $SiteUrl" -ForegroundColor Yellow
try {
    if ($UseWebLogin) {
        # Use web browser login
        Write-Host "Using web browser login..." -ForegroundColor Gray
        Connect-PnPOnline -Url $SiteUrl -UseWebLogin
    } elseif ($ClientId -ne "") {
        # Use provided client ID with interactive login
        Write-Host "Using provided Client ID for authentication..." -ForegroundColor Gray
        Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId
    } else {
        # Use device code flow (most reliable)
        Write-Host "Using device code authentication..." -ForegroundColor Gray
        Write-Host "A browser window will open - sign in with your Microsoft account" -ForegroundColor Yellow
        Connect-PnPOnline -Url $SiteUrl -DeviceLogin
    }
    Write-Host "Connected successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to connect to SharePoint: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Try with web login: .\add-approval-columns.ps1 -UseWebLogin" -ForegroundColor Gray
    Write-Host "  2. Or use your existing Azure AD app:" -ForegroundColor Gray
    Write-Host "     .\add-approval-columns.ps1 -ClientId '06fcde50-24bf-4d53-838d-ecc035653d8f'" -ForegroundColor Gray
    Write-Host "  3. Register PnP Management Shell:" -ForegroundColor Gray
    Write-Host "     Register-PnPManagementShellAccess" -ForegroundColor Gray
    exit 1
}

# Get the list
Write-Host ""
Write-Host "Getting list: $ListName" -ForegroundColor Yellow
try {
    $list = Get-PnPList -Identity $ListName
    if (-not $list) {
        Write-Host "ERROR: List '$ListName' not found." -ForegroundColor Red
        exit 1
    }
    Write-Host "Found list: $($list.Title)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to get list: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Adding approval workflow columns..." -ForegroundColor Cyan
Write-Host ""

# Function to add a field if it doesn't exist
function Add-FieldIfNotExists {
    param(
        [string]$FieldName,
        [string]$DisplayName,
        [string]$FieldType,
        [hashtable]$AdditionalParams = @{}
    )

    $existingField = Get-PnPField -List $ListName -Identity $FieldName -ErrorAction SilentlyContinue

    if ($existingField) {
        Write-Host "  [SKIP] '$DisplayName' already exists" -ForegroundColor Gray
        return $false
    }

    try {
        $params = @{
            List = $ListName
            InternalName = $FieldName
            DisplayName = $DisplayName
            Type = $FieldType
        }

        # Merge additional params
        foreach ($key in $AdditionalParams.Keys) {
            $params[$key] = $AdditionalParams[$key]
        }

        Add-PnPField @params | Out-Null
        Write-Host "  [ADDED] '$DisplayName' ($FieldType)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  [ERROR] Failed to add '$DisplayName': $_" -ForegroundColor Red
        return $false
    }
}

# 1. ApprovalStatus - Choice field
Write-Host "1. ApprovalStatus (Choice)" -ForegroundColor White
$existingField = Get-PnPField -List $ListName -Identity "ApprovalStatus" -ErrorAction SilentlyContinue
if ($existingField) {
    Write-Host "  [SKIP] 'ApprovalStatus' already exists" -ForegroundColor Gray
} else {
    try {
        # Create choice field with XML for more control
        $choiceXml = @"
<Field Type="Choice" DisplayName="ApprovalStatus" Required="FALSE" Format="Dropdown" FillInChoice="FALSE" StaticName="ApprovalStatus" Name="ApprovalStatus">
    <Default>None</Default>
    <CHOICES>
        <CHOICE>None</CHOICE>
        <CHOICE>Pending</CHOICE>
        <CHOICE>Approved</CHOICE>
        <CHOICE>Denied</CHOICE>
        <CHOICE>Changes Requested</CHOICE>
    </CHOICES>
</Field>
"@
        Add-PnPFieldFromXml -List $ListName -FieldXml $choiceXml | Out-Null
        Write-Host "  [ADDED] 'ApprovalStatus' (Choice: None, Pending, Approved, Denied, Changes Requested)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Failed to add 'ApprovalStatus': $_" -ForegroundColor Red
    }
}

# 2. ApprovalRequestedDate - DateTime field
Write-Host "2. ApprovalRequestedDate (DateTime)" -ForegroundColor White
Add-FieldIfNotExists -FieldName "ApprovalRequestedDate" -DisplayName "Approval Requested Date" -FieldType "DateTime"

# 3. ApprovalDate - DateTime field
Write-Host "3. ApprovalDate (DateTime)" -ForegroundColor White
Add-FieldIfNotExists -FieldName "ApprovalDate" -DisplayName "Approval Date" -FieldType "DateTime"

# 4. ApprovalNotes - Multi-line text field
Write-Host "4. ApprovalNotes (Multi-line Text)" -ForegroundColor White
$existingField = Get-PnPField -List $ListName -Identity "ApprovalNotes" -ErrorAction SilentlyContinue
if ($existingField) {
    Write-Host "  [SKIP] 'ApprovalNotes' already exists" -ForegroundColor Gray
} else {
    try {
        $notesXml = @"
<Field Type="Note" DisplayName="ApprovalNotes" Required="FALSE" NumLines="6" RichText="FALSE" StaticName="ApprovalNotes" Name="ApprovalNotes" />
"@
        Add-PnPFieldFromXml -List $ListName -FieldXml $notesXml | Out-Null
        Write-Host "  [ADDED] 'ApprovalNotes' (Multi-line Text)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Failed to add 'ApprovalNotes': $_" -ForegroundColor Red
    }
}

# 5. ApprovalRequestedBy - Person/Group lookup (stores user who requested)
Write-Host "5. ApprovalRequestedBy (Person)" -ForegroundColor White
$existingField = Get-PnPField -List $ListName -Identity "ApprovalRequestedBy" -ErrorAction SilentlyContinue
if ($existingField) {
    Write-Host "  [SKIP] 'ApprovalRequestedBy' already exists" -ForegroundColor Gray
} else {
    try {
        Add-PnPField -List $ListName -InternalName "ApprovalRequestedBy" -DisplayName "Approval Requested By" -Type User | Out-Null
        Write-Host "  [ADDED] 'ApprovalRequestedBy' (Person)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Failed to add 'ApprovalRequestedBy': $_" -ForegroundColor Red
    }
}

# 6. ApprovedBy - Person/Group lookup (stores user who approved/denied)
Write-Host "6. ApprovedBy (Person)" -ForegroundColor White
$existingField = Get-PnPField -List $ListName -Identity "ApprovedBy" -ErrorAction SilentlyContinue
if ($existingField) {
    Write-Host "  [SKIP] 'ApprovedBy' already exists" -ForegroundColor Gray
} else {
    try {
        Add-PnPField -List $ListName -InternalName "ApprovedBy" -DisplayName "Approved By" -Type User | Out-Null
        Write-Host "  [ADDED] 'ApprovedBy' (Person)" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Failed to add 'ApprovedBy': $_" -ForegroundColor Red
    }
}

# Disconnect from SharePoint
Disconnect-PnPOnline

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " SharePoint columns setup complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Environment variable instructions
Write-Host "NEXT STEP: Configure Environment Variable" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Add the following to your .env.local file:" -ForegroundColor White
Write-Host ""
Write-Host "  NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID=<your-group-id>" -ForegroundColor Cyan
Write-Host ""
Write-Host "To find the Group ID:" -ForegroundColor White
Write-Host "  1. Go to https://portal.azure.com" -ForegroundColor Gray
Write-Host "  2. Navigate to Azure Active Directory > Groups" -ForegroundColor Gray
Write-Host "  3. Search for your General Managers group" -ForegroundColor Gray
Write-Host "  4. Copy the 'Object ID' (e.g., 12345678-1234-1234-1234-123456789abc)" -ForegroundColor Gray
Write-Host ""
Write-Host "Optionally, also add:" -ForegroundColor White
Write-Host "  NEXT_PUBLIC_APP_URL=https://your-app-url.com" -ForegroundColor Cyan
Write-Host "  (Used for email action button links)" -ForegroundColor Gray
Write-Host ""
