# =============================================================================
# Pause Orphan Vikunja SyncMap Rows
# =============================================================================
# Scans the VikunjaSyncMap list and pauses any sync mapping whose ticket is no
# longer a Tech ticket (ProblemType != "Tech"). This prevents the Vikunja
# webhook from accidentally resolving or mirroring tickets that were moved to
# another department after creation.
#
# Prerequisites:
#   - PnP PowerShell module: Install-Module -Name PnP.PowerShell -Scope CurrentUser
#   - SharePoint permissions on the help desk site
#
# Usage:
#   .\pause-orphan-vikunja-syncmaps.ps1
#   .\pause-orphan-vikunja-syncmaps.ps1 -DryRun                    # report only, no writes
#   .\pause-orphan-vikunja-syncmaps.ps1 -SyncMapList "CustomName"  # override list name
# =============================================================================

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk",
    [string]$TicketsList = "Tickets",
    [string]$SyncMapList = "VikunjaSyncMap",
    [string]$ClientId = "",
    [switch]$UseWebLogin = $false,
    [switch]$DryRun = $false
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Pause Orphan Vikunja SyncMap Rows" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
if ($DryRun) { Write-Host " DRY RUN — no writes will be performed" -ForegroundColor Yellow }
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

# Fetch all SyncMap rows
Write-Host "Fetching SyncMap entries..." -ForegroundColor Yellow
try {
    $syncMaps = Get-PnPListItem -List $SyncMapList -PageSize 500
} catch {
    Write-Host "ERROR: Could not read list '$SyncMapList': $_" -ForegroundColor Red
    Disconnect-PnPOnline
    exit 1
}

$total = $syncMaps.Count
Write-Host "Found $total SyncMap rows." -ForegroundColor Green
Write-Host ""

$pausedCount = 0
$skippedAlreadyPaused = 0
$skippedStillTech = 0
$skippedMissingTicket = 0
$errors = 0

foreach ($map in $syncMaps) {
    $ticketId = $map["TicketId"]
    $status = $map["SyncStatus"]
    $title = $map["Title"]

    if ($status -eq "Paused") {
        $skippedAlreadyPaused++
        continue
    }

    if (-not $ticketId) {
        Write-Host "  [skip] SyncMap #$($map.Id) has no TicketId" -ForegroundColor DarkGray
        $skippedMissingTicket++
        continue
    }

    # Look up the ticket's ProblemType
    try {
        $ticket = Get-PnPListItem -List $TicketsList -Id ([int]$ticketId) -Fields "ProblemType","Title" -ErrorAction Stop
    } catch {
        Write-Host "  [skip] Ticket $ticketId not found (deleted?): $_" -ForegroundColor DarkGray
        $skippedMissingTicket++
        continue
    }

    $problemType = $ticket["ProblemType"]

    if ($problemType -eq "Tech") {
        $skippedStillTech++
        continue
    }

    # Orphan detected — pause the mapping
    Write-Host "  [pause] Ticket $ticketId '$($ticket["Title"])' is ProblemType='$problemType' (SyncMap #$($map.Id) title=$title)" -ForegroundColor Yellow

    if (-not $DryRun) {
        try {
            Set-PnPListItem -List $SyncMapList -Identity $map.Id -Values @{
                SyncStatus = "Paused"
                LastError  = "One-time cleanup: ticket ProblemType=$problemType (not Tech); paused to prevent cross-wiring"
            } | Out-Null
            $pausedCount++
        } catch {
            Write-Host "    ERROR pausing SyncMap #$($map.Id): $_" -ForegroundColor Red
            $errors++
        }
    } else {
        $pausedCount++
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Total SyncMap rows scanned:  $total"
Write-Host "Still Tech (left active):    $skippedStillTech" -ForegroundColor Green
Write-Host "Already paused:              $skippedAlreadyPaused" -ForegroundColor DarkGray
Write-Host "Missing ticket (skipped):    $skippedMissingTicket" -ForegroundColor DarkGray
if ($DryRun) {
    Write-Host "Would pause (dry run):       $pausedCount" -ForegroundColor Yellow
} else {
    Write-Host "Paused:                      $pausedCount" -ForegroundColor Yellow
    Write-Host "Errors:                      $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
}

Disconnect-PnPOnline
