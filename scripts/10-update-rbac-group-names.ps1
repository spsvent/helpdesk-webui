# 10-update-rbac-group-names.ps1
# Fetches actual group names from Entra ID and updates the RBACGroups SharePoint list

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk"
)

$ListName = "RBACGroups"

# Check if already connected to PnP
try {
    $ctx = Get-PnPContext
    if (-not $ctx) { throw "Not connected" }
    Write-Host "Using existing PnP connection" -ForegroundColor Green
} catch {
    Write-Host "Connecting to SharePoint..." -ForegroundColor Cyan
    Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId "2b22e4ba-e86b-4d01-8a27-dab20b287138"
}

# Get access token for Microsoft Graph
Write-Host "Getting Graph API access token..." -ForegroundColor Cyan
$token = Get-PnPAccessToken -ResourceTypeName Graph

if (-not $token) {
    Write-Error "Failed to get Graph API access token. Make sure you have the necessary permissions."
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get all items from RBACGroups list
Write-Host "`nFetching items from RBACGroups list..." -ForegroundColor Cyan
$items = Get-PnPListItem -List $ListName -Fields "Id", "Title", "GroupId"

Write-Host "Found $($items.Count) items`n" -ForegroundColor Green

# Update each item with the actual group name from Entra ID
foreach ($item in $items) {
    $groupId = $item.FieldValues["GroupId"]
    $currentTitle = $item.FieldValues["Title"]
    $itemId = $item.Id

    if (-not $groupId) {
        Write-Host "  Skipping item $itemId - no GroupId" -ForegroundColor Yellow
        continue
    }

    # Fetch group details from Microsoft Graph
    try {
        $graphUrl = "https://graph.microsoft.com/v1.0/groups/$groupId"
        $response = Invoke-RestMethod -Uri $graphUrl -Headers $headers -Method Get
        $actualName = $response.displayName

        if ($actualName -and $actualName -ne $currentTitle) {
            Write-Host "  Updating: '$currentTitle' -> '$actualName'" -ForegroundColor Green
            Set-PnPListItem -List $ListName -Identity $itemId -Values @{ Title = $actualName } | Out-Null
        } else {
            Write-Host "  Already correct: '$currentTitle'" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Failed to fetch group $groupId : $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nDone! Group names have been updated." -ForegroundColor Green
