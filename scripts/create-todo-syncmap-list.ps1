# =============================================================================
# Create the TodoSyncMap SharePoint List
# =============================================================================
# Provisions the list that maps Help Desk tickets to Microsoft To Do tasks for
# the "assigned Tech tickets -> To Do" sync (azure-functions/src/functions/syncToTodo.js).
#
# The list is one-directional bookkeeping only (Help Desk -> To Do). One row per
# synced ticket:
#   Title              (default)  - the ticket number, for readability
#   TicketId           (text)     - SharePoint item id of the ticket (lookup key)
#   TodoTaskId         (text)     - the Microsoft To Do task id
#   LastSyncTimestamp  (text)     - ISO timestamp of the last push
#   SyncStatus         (choice)   - Active | Paused | Error
#   LastError          (note)     - last error / pause reason, if any
#
# After running, copy the printed list GUID into the Function App setting
#   TODO_SYNC_MAP_LIST_ID
# (Azure Portal -> Function Apps -> helpdesk-notify-func -> Environment variables).
#
# Prerequisites:
#   - PnP PowerShell module: Install-Module -Name PnP.PowerShell -Scope CurrentUser
#   - SharePoint write permissions on the help desk site
#
# Usage:
#   .\create-todo-syncmap-list.ps1
#   .\create-todo-syncmap-list.ps1 -UseWebLogin
#   .\create-todo-syncmap-list.ps1 -ClientId "<app-id>"
# =============================================================================

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk",
    [string]$ListName = "TodoSyncMap",
    [string]$ClientId = "",
    [switch]$UseWebLogin = $false
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Create TodoSyncMap List" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "ERROR: PnP.PowerShell module is not installed." -ForegroundColor Red
    Write-Host "Install it with: Install-Module -Name PnP.PowerShell -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

Write-Host "Connecting to $SiteUrl..." -ForegroundColor Yellow
try {
    if ($UseWebLogin) {
        Connect-PnPOnline -Url $SiteUrl -UseWebLogin
    } elseif ($ClientId) {
        Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
    } else {
        Connect-PnPOnline -Url $SiteUrl -DeviceLogin
    }
    Write-Host "Connected." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to connect: $_" -ForegroundColor Red
    exit 1
}

# Create the list if it doesn't already exist
$list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
if ($list) {
    Write-Host "List '$ListName' already exists — ensuring columns." -ForegroundColor Yellow
} else {
    Write-Host "Creating list '$ListName'..." -ForegroundColor Yellow
    $list = New-PnPList -Title $ListName -Template GenericList -EnableVersioning
    Write-Host "Created." -ForegroundColor Green
}

# Add text/note columns (idempotent — skip if present)
function Ensure-TextColumn($internalName, $type) {
    $existing = Get-PnPField -List $ListName -Identity $internalName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  [skip] $internalName exists" -ForegroundColor DarkGray
    } else {
        Add-PnPField -List $ListName -DisplayName $internalName -InternalName $internalName -Type $type -AddToDefaultView | Out-Null
        Write-Host "  [add]  $internalName ($type)" -ForegroundColor Green
    }
}

Ensure-TextColumn "TicketId"          "Text"
Ensure-TextColumn "TodoTaskId"        "Text"
Ensure-TextColumn "LastSyncTimestamp" "Text"
Ensure-TextColumn "LastError"         "Note"

# SyncStatus as a choice column
$statusField = Get-PnPField -List $ListName -Identity "SyncStatus" -ErrorAction SilentlyContinue
if ($statusField) {
    Write-Host "  [skip] SyncStatus exists" -ForegroundColor DarkGray
} else {
    Add-PnPField -List $ListName -DisplayName "SyncStatus" -InternalName "SyncStatus" -Type Choice `
        -Choices "Active","Paused","Error" -AddToDefaultView | Out-Null
    Write-Host "  [add]  SyncStatus (Choice)" -ForegroundColor Green
}

# Index TicketId so the $filter lookup in syncToTodo.js is reliable
try {
    Set-PnPField -List $ListName -Identity "TicketId" -Values @{ Indexed = $true } | Out-Null
    Write-Host "  [idx]  TicketId indexed" -ForegroundColor Green
} catch {
    Write-Host "  [warn] Could not index TicketId: $_" -ForegroundColor Yellow
}

$freshList = Get-PnPList -Identity $ListName
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Done" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "List name:  $ListName"
Write-Host "List GUID:  $($freshList.Id)" -ForegroundColor Green
Write-Host ""
Write-Host "Set this on the Function App:" -ForegroundColor Yellow
Write-Host "  TODO_SYNC_MAP_LIST_ID = $($freshList.Id)" -ForegroundColor White

Disconnect-PnPOnline
