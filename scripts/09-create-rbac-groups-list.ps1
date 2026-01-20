# 09-create-rbac-groups-list.ps1
# Creates the RBACGroups list in SharePoint for managing RBAC visibility groups

param(
    [string]$SiteUrl = "https://skyparksv.sharepoint.com/sites/helpdesk"
)

# Connect to SharePoint
Connect-PnPOnline -Url $SiteUrl -Interactive

$ListName = "RBACGroups"

# Check if list exists
$existingList = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue

if ($existingList) {
    Write-Host "List '$ListName' already exists. Skipping creation." -ForegroundColor Yellow
} else {
    Write-Host "Creating list '$ListName'..." -ForegroundColor Cyan

    # Create the list
    New-PnPList -Title $ListName -Template GenericList -EnableVersioning

    # Add columns
    Add-PnPField -List $ListName -DisplayName "Group ID" -InternalName "GroupId" -Type Text -Required
    Add-PnPField -List $ListName -DisplayName "Group Type" -InternalName "GroupType" -Type Choice -Choices "visibility", "department", "admin" -Required
    Add-PnPField -List $ListName -DisplayName "Department" -InternalName "Department" -Type Text
    Add-PnPField -List $ListName -DisplayName "Problem Type Sub" -InternalName "ProblemTypeSub" -Type Text
    Add-PnPField -List $ListName -DisplayName "Is Active" -InternalName "IsActive" -Type Boolean

    # Set default value for IsActive
    $field = Get-PnPField -List $ListName -Identity "IsActive"
    $field.DefaultValue = "1"
    $field.Update()
    Invoke-PnPQuery

    Write-Host "List created successfully!" -ForegroundColor Green
}

# Initial data - Groups for visibility (regular staff ticket sharing)
$visibilityGroups = @(
    @{ Title = "Admissions"; GroupId = "aa6020eb-e4b4-46ce-a720-945cf2bf5d8d"; GroupType = "department"; Department = "Customer Service" },
    @{ Title = "Group 2"; GroupId = "bf86729c-9cfb-4623-bfaa-379321a483d8"; GroupType = "visibility" },
    @{ Title = "Group 3"; GroupId = "bf1edb89-01cf-47d7-8750-f0e8d905168c"; GroupType = "visibility" },
    @{ Title = "Group 4"; GroupId = "a31beaf7-947f-4a65-8f57-97edbdd4b609"; GroupType = "visibility" },
    @{ Title = "Group 5"; GroupId = "087c0a86-b26f-4f3e-a969-4df922d26b61"; GroupType = "visibility" },
    @{ Title = "Group 6"; GroupId = "68da46bf-aa35-44af-a56c-ad944cd699c5"; GroupType = "visibility" },
    @{ Title = "Group 7"; GroupId = "ec5ac766-bb91-4bf1-bbfb-f08586670e51"; GroupType = "visibility" },
    @{ Title = "Group 8"; GroupId = "4eea8cec-9b89-4e39-9e31-84d6705e57c0"; GroupType = "visibility" },
    @{ Title = "Group 9"; GroupId = "ab2d5b84-17c9-4892-ba49-f3001e8206a7"; GroupType = "visibility" },
    @{ Title = "Group 10"; GroupId = "04cd63e8-a3f4-4288-a1e9-2295c5874903"; GroupType = "visibility" },
    @{ Title = "Grounds Keeping"; GroupId = "b9dbaa5a-5bda-4ca0-bcb6-bd2f3783739f"; GroupType = "department"; Department = "Grounds Keeping" },
    @{ Title = "Group 12"; GroupId = "3c9e89ce-83dd-4c31-a884-01404b81898e"; GroupType = "visibility" },
    @{ Title = "IT/AV"; GroupId = "7e1b9f86-5fc0-4f83-a6d2-e52167d0e4cf"; GroupType = "department"; Department = "Tech" },
    @{ Title = "Janitorial"; GroupId = "0334654b-6c6a-4a29-9f00-7dcd09c34b3d"; GroupType = "department"; Department = "Janitorial" },
    @{ Title = "Group 15"; GroupId = "b192046d-724d-4902-925a-e2b82dadea57"; GroupType = "visibility" },
    @{ Title = "Operations"; GroupId = "12c1b657-305b-4fb3-8534-bcf1fe5cd326"; GroupType = "department"; Department = "Operations" },
    @{ Title = "Group 17"; GroupId = "1bfd60d4-e559-4246-a14f-aba95d4705e6"; GroupType = "visibility" },
    @{ Title = "Group 18"; GroupId = "7b726e83-b503-4306-848c-11d7c82e59fb"; GroupType = "visibility" },
    @{ Title = "Group 19"; GroupId = "bfb9c840-8c79-4df9-8334-8e4da41f9ede"; GroupType = "visibility" },
    @{ Title = "Group 20"; GroupId = "399b7eea-2d0a-4aa4-af5a-8c40f9d2d505"; GroupType = "visibility" }
)

# Add additional department groups not in the visibility list
$additionalDeptGroups = @(
    @{ Title = "Marketing"; GroupId = "7114b9f5-734e-4c0d-a46d-0c96679d51c0"; GroupType = "department"; Department = "Marketing" },
    @{ Title = "HR Manager"; GroupId = "bcd1cb4f-d182-4f0e-8ace-fdee41e005f8"; GroupType = "department"; Department = "HR" },
    @{ Title = "POSadmins"; GroupId = "b581fbb5-5a56-459e-8342-4386d43b048d"; GroupType = "department"; Department = "Tech"; ProblemTypeSub = "POS" },
    @{ Title = "GeneralManagers"; GroupId = "db86fdc8-dbf7-4ec9-af9f-461bb63735ed"; GroupType = "admin" }
)

Write-Host "`nPopulating list with groups..." -ForegroundColor Cyan

foreach ($group in $visibilityGroups + $additionalDeptGroups) {
    # Check if already exists
    $existing = Get-PnPListItem -List $ListName -Query "<View><Query><Where><Eq><FieldRef Name='GroupId'/><Value Type='Text'>$($group.GroupId)</Value></Eq></Where></Query></View>"

    if ($existing) {
        Write-Host "  Group '$($group.Title)' already exists, skipping." -ForegroundColor Yellow
    } else {
        $values = @{
            Title = $group.Title
            GroupId = $group.GroupId
            GroupType = $group.GroupType
            IsActive = $true
        }
        if ($group.Department) { $values.Department = $group.Department }
        if ($group.ProblemTypeSub) { $values.ProblemTypeSub = $group.ProblemTypeSub }

        Add-PnPListItem -List $ListName -Values $values | Out-Null
        Write-Host "  Added: $($group.Title) ($($group.GroupType))" -ForegroundColor Green
    }
}

Write-Host "`nDone! RBACGroups list is ready." -ForegroundColor Green
Write-Host "You can update group names in SharePoint to be more descriptive." -ForegroundColor Cyan

# Get the list ID for .env.local
$list = Get-PnPList -Identity $ListName
Write-Host "`nList ID for .env.local:" -ForegroundColor Yellow
Write-Host "NEXT_PUBLIC_RBAC_GROUPS_LIST_ID=$($list.Id)" -ForegroundColor White
