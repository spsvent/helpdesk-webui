# Create-PurchaseColumns.ps1
# Creates the 17 SharePoint columns needed for the Purchase Request workflow
# on the Tickets list in the SkyPark Help Desk site.
#
# Prerequisites: PnP.PowerShell module (Install-Module PnP.PowerShell)
# Usage: pwsh ./scripts/Create-PurchaseColumns.ps1

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk",
    [string]$ListName = "Tickets",
    [string]$TenantId = "f0db97c1-2010-4d0c-826e-d6e0f2b25f2f"
)

$ErrorActionPreference = "Stop"

# Use the existing Help Desk app registration
$PnPClientId = "06fcde50-24bf-4d53-838d-ecc035653d8f"

Write-Host "`n=== SkyPark Help Desk - Purchase Request Column Setup ===" -ForegroundColor Cyan
Write-Host "Site: $SiteUrl"
Write-Host "List: $ListName`n"

# Step 1: Get access token via device code flow
Write-Host "Authenticating via device code flow..." -ForegroundColor Yellow

$deviceCodeBody = @{
    client_id = $PnPClientId
    scope     = "https://skyparksv.sharepoint.com/AllSites.FullControl offline_access"
    tenant    = $TenantId
}

try {
    $deviceCodeResponse = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
        -Body $deviceCodeBody

    Write-Host "`n$($deviceCodeResponse.message)" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "Failed to initiate device code flow: $_" -ForegroundColor Red
    exit 1
}

# Poll for token
$tokenBody = @{
    grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
    client_id   = $PnPClientId
    device_code = $deviceCodeResponse.device_code
    tenant      = $TenantId
}

$token = $null
$deadline = (Get-Date).AddSeconds($deviceCodeResponse.expires_in)

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $deviceCodeResponse.interval
    try {
        $token = Invoke-RestMethod -Method Post `
            -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
            -Body $tokenBody
        break
    } catch {
        $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($err.error -eq "authorization_pending") {
            Write-Host "  Waiting for authentication..." -ForegroundColor DarkGray
            continue
        } elseif ($err.error -eq "authorization_declined") {
            Write-Host "Authentication was declined." -ForegroundColor Red
            exit 1
        } elseif ($err.error -eq "expired_token") {
            Write-Host "Device code expired. Please try again." -ForegroundColor Red
            exit 1
        } else {
            Write-Host "Token error: $($err.error) - $($err.error_description)" -ForegroundColor Red
            exit 1
        }
    }
}

if (-not $token) {
    Write-Host "Authentication timed out." -ForegroundColor Red
    exit 1
}

Write-Host "Authenticated successfully.`n" -ForegroundColor Green

# Now connect PnP using the access token
Connect-PnPOnline -Url $SiteUrl -AccessToken $token.access_token
Write-Host "Connected to SharePoint.`n" -ForegroundColor Green

# Track results
$created = @()
$skipped = @()
$failed = @()

function Add-ColumnIfNotExists {
    param(
        [string]$DisplayName,
        [string]$InternalName,
        [string]$Type,
        [hashtable]$ExtraParams = @{}
    )

    # Check if column already exists
    $existing = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  SKIP  $DisplayName (already exists)" -ForegroundColor DarkGray
        $script:skipped += $DisplayName
        return
    }

    try {
        $params = @{
            List         = $ListName
            DisplayName  = $DisplayName
            InternalName = $InternalName
            Type         = $Type
            AddToDefaultView = $false
        }
        # Merge extra params
        foreach ($key in $ExtraParams.Keys) {
            $params[$key] = $ExtraParams[$key]
        }

        Add-PnPField @params | Out-Null
        Write-Host "  OK    $DisplayName ($Type)" -ForegroundColor Green
        $script:created += $DisplayName
    } catch {
        Write-Host "  FAIL  $DisplayName - $_" -ForegroundColor Red
        $script:failed += $DisplayName
    }
}

Write-Host "Creating columns on '$ListName' list...`n" -ForegroundColor Yellow

# 1. IsPurchaseRequest - Boolean
Add-ColumnIfNotExists -DisplayName "IsPurchaseRequest" -InternalName "IsPurchaseRequest" -Type Boolean

# 2. PurchaseItemUrl - Text (255)
Add-ColumnIfNotExists -DisplayName "PurchaseItemUrl" -InternalName "PurchaseItemUrl" -Type Text

# 3. PurchaseQuantity - Number (integer, min 1)
Add-ColumnIfNotExists -DisplayName "PurchaseQuantity" -InternalName "PurchaseQuantity" -Type Number

# 4. PurchaseEstCostPerItem - Currency
Add-ColumnIfNotExists -DisplayName "PurchaseEstCostPerItem" -InternalName "PurchaseEstCostPerItem" -Type Currency

# 5. PurchaseJustification - Multi-line text
Add-ColumnIfNotExists -DisplayName "PurchaseJustification" -InternalName "PurchaseJustification" -Type Note

# 6. PurchaseProject - Text (255)
Add-ColumnIfNotExists -DisplayName "PurchaseProject" -InternalName "PurchaseProject" -Type Text

# 7. PurchaseStatus - Choice
$purchaseStatusChoices = @(
    "Pending Approval",
    "Approved",
    "Approved with Changes",
    "Ordered",
    "Purchased",
    "Received",
    "Denied"
)

$existing = Get-PnPField -List $ListName -Identity "PurchaseStatus" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  SKIP  PurchaseStatus (already exists)" -ForegroundColor DarkGray
    $skipped += "PurchaseStatus"
} else {
    try {
        Add-PnPField -List $ListName -DisplayName "PurchaseStatus" -InternalName "PurchaseStatus" -Type Choice -Choices $purchaseStatusChoices -AddToDefaultView $false | Out-Null
        Write-Host "  OK    PurchaseStatus (Choice)" -ForegroundColor Green
        $created += "PurchaseStatus"
    } catch {
        Write-Host "  FAIL  PurchaseStatus - $_" -ForegroundColor Red
        $failed += "PurchaseStatus"
    }
}

# 8. PurchaseVendor - Text (255)
Add-ColumnIfNotExists -DisplayName "PurchaseVendor" -InternalName "PurchaseVendor" -Type Text

# 9. PurchaseConfirmationNum - Text (255)
Add-ColumnIfNotExists -DisplayName "PurchaseConfirmationNum" -InternalName "PurchaseConfirmationNum" -Type Text

# 10. PurchaseActualCost - Currency
Add-ColumnIfNotExists -DisplayName "PurchaseActualCost" -InternalName "PurchaseActualCost" -Type Currency

# 11. PurchaseNotes - Multi-line text
Add-ColumnIfNotExists -DisplayName "PurchaseNotes" -InternalName "PurchaseNotes" -Type Note

# 12. PurchaseExpectedDelivery - DateTime (date only)
Add-ColumnIfNotExists -DisplayName "PurchaseExpectedDelivery" -InternalName "PurchaseExpectedDelivery" -Type DateTime

# 13. PurchasedDate - DateTime (date only)
Add-ColumnIfNotExists -DisplayName "PurchasedDate" -InternalName "PurchasedDate" -Type DateTime

# 14. PurchasedByEmail - Text (255)
Add-ColumnIfNotExists -DisplayName "PurchasedByEmail" -InternalName "PurchasedByEmail" -Type Text

# 15. ReceivedDate - DateTime (date only)
Add-ColumnIfNotExists -DisplayName "ReceivedDate" -InternalName "ReceivedDate" -Type DateTime

# 16. ReceivedNotes - Multi-line text
Add-ColumnIfNotExists -DisplayName "ReceivedNotes" -InternalName "ReceivedNotes" -Type Note

# 17. ReceivedByEmail - Text (255)
Add-ColumnIfNotExists -DisplayName "ReceivedByEmail" -InternalName "ReceivedByEmail" -Type Text

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Created: $($created.Count)" -ForegroundColor Green
Write-Host "Skipped: $($skipped.Count) (already existed)" -ForegroundColor DarkGray
Write-Host "Failed:  $($failed.Count)" -ForegroundColor $(if ($failed.Count -gt 0) { "Red" } else { "DarkGray" })

if ($created.Count -gt 0) {
    Write-Host "`nNew columns:" -ForegroundColor Green
    $created | ForEach-Object { Write-Host "  + $_" -ForegroundColor Green }
}

if ($failed.Count -gt 0) {
    Write-Host "`nFailed columns:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  ! $_" -ForegroundColor Red }
}

# Disconnect
Disconnect-PnPOnline
Write-Host "`nDone.`n" -ForegroundColor Cyan
