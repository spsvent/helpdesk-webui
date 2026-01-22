# SkyPark Help Desk Roadmap

## Priority Order

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Search & Filtering** | ✅ Complete | Full search (ID, title, desc, requester, assignee, location) + filters |
| 2 | **File Attachments** | ✅ Complete | Upload/download/delete via SharePoint list attachments |
| 3 | **Old Ticket Migration** | ✅ Complete | PowerShell scripts migrate from Plumsail supportdesk |
| 4 | **Email Notifications** | ✅ Complete | Notify on ticket create, assignments, comments, status changes |
| 5 | **Bulk Actions** | ✅ Complete | Admin-only: status/priority/reassign multiple tickets |
| 6 | **Dashboard** | ⬜ Planned | Analytics, ticket counts, response times |
| 7 | **Teams Integration** | ✅ Complete | Notifications in Teams channels |
| 8 | **Request Approval Gate** | 🔴 Must Do | Requests require admin approval before support sees them |
| 9 | **Assignee Preview** | 🔴 Must Do | Show assigned roles/titles when selecting department |
| 10 | **Category Guidance** | 🔴 Must Do | Clear instructions for choosing Problem vs Request |
| 11 | **Mobile App** | ⬜ Planned | PWA or responsive improvements |
| 12 | **Dark Mode** | ⬜ Planned | Manual dark/light toggle |
| 13 | **SLA Tracking** | ⬜ Planned | Due date alerts, escalation rules |
| 14 | **Grafana Connection** | ⬜ Planned | Metrics/dashboard integration (consider as main dashboard?) |
| 15 | **App-Only Sign Out** | ⬜ Explore | Sign out of Help Desk without clearing browser-wide MS token |

---

## Feature Details

### 1. Search & Filtering ✅
**Status:** Complete

**Implemented:**
- Full-text search across title, description, requester, assignee, location
- Search by ticket ID (with or without # prefix)
- Filter by status (multi-select)
- Filter by priority (multi-select)
- Filter by department (cascading: Dept → Sub → Specific)
- Filter by category (Request/Problem)
- Filter by assignee (dropdown of active assignees)
- Filter by location (dropdown of locations with tickets)
- Date range filtering (Today, Week, Month, All)
- Sort options (Smart, Priority, Newest, Oldest)
- Preset views (Active, By Priority, All, Open Only)
- Load archived tickets (90+ days old)

---

### 2. File Attachments ✅
**Status:** Complete

**Implemented:**
- SharePoint list item attachments for storage
- Upload via drag-and-drop or file picker
- Download attachments to local machine
- Delete attachments (with confirmation)
- File type icons (images, PDFs, docs, spreadsheets)
- File size display in human-readable format
- 10MB max file size limit
- Supported types: images, PDFs, Word docs, Excel files, text/CSV, log files

**Components:**
- `AttachmentUpload.tsx` - Drag-and-drop upload zone
- `AttachmentList.tsx` - Display with download/delete actions
- Graph API functions in `graphClient.ts`

---

### 3. Old Ticket Migration ✅
**Status:** Complete

**Source System:** Plumsail supportdesk at `/sites/supportdesk`

**Scripts (in parent directory):**
- `05c-discover-migration-sources.ps1` - Catalog source schemas
- `06-migrate-tickets.ps1` - Migrate tickets with field transformations
- `07-migrate-comments.ps1` - Migrate comments linked to tickets

**Field Mappings:**
- Category: Question→Request, Incident→Problem
- Status: Pending→On Hold, Solved→Resolved, etc.
- ProblemType: All old types→Tech (IT-focused legacy system)
- Location: Various renames/merges

**Preserved Data:**
- Original timestamps (Created/Modified)
- Original authors via `OriginalRequester`, `OriginalAssignedTo`, `OriginalAuthor` fields
- Legacy ticket URL for reference

**Web UI Support:**
- Types include `originalRequester`, `originalAssignedTo` for migrated tickets
- Comments include `originalAuthor`, `originalCreated` for migrated comments

---

### 4. Email Notifications ✅
**Status:** Complete

**Implemented Triggers:**
- New ticket created → notify assignee
- Ticket assigned/reassigned → notify new assignee
- New public comment added → notify requester and assignee
- Status changed → notify requester
- Approval requested → notify managers (General Managers group)
- Approval decided → notify requester

**Technical Details:**
- Microsoft Graph API sendMail
- HTML email templates with responsive design
- Action buttons in emails (for approvals)
- Non-blocking - email failures don't block ticket operations

---

### 5. Bulk Actions ✅
**Status:** Complete (Admin only)

**Implemented:**
- Set status on multiple tickets
- Set priority on multiple tickets
- Reassign multiple tickets
- Checkbox selection in ticket list
- Shift-click for range selection
- Action toolbar appears when items selected

**Components:**
- `BulkActionToolbar.tsx` - Dropdown menus for bulk operations
- Updated `TicketList.tsx` with checkbox support
- Graph API functions: `bulkUpdateStatus`, `bulkUpdatePriority`, `bulkReassign`

**Note:** Only visible to users with Admin role

---

### 6. Dashboard ⬜
**Status:** Planned

**Metrics:**
- Tickets by status (pie chart)
- Tickets by department (bar chart)
- Open vs closed over time (line chart)
- Average resolution time
- Top requesters/assignees
- Overdue tickets count

**Consider:** Using Grafana instead (see #11)

---

### 7. Teams Integration ✅
**Status:** Complete

**Implemented:**
- Post to department-specific Teams channels
- Notifications for Normal, High, and Urgent priority tickets (Low excluded)
- Adaptive Cards with rich formatting
- Deep links back to Help Desk app

**Notification Triggers:**
- New ticket created → Blue accent card with full details
- Status changed → Shows old → new status transition
- Priority escalated → Orange/red warning card (only for increases)

**Technical Details:**
- Microsoft Graph API `ChannelMessage.Send` permission
- SharePoint list (TeamsChannels) for channel configuration
- Per-department channel mapping with configurable minimum priority
- Fire-and-forget pattern - failures don't block ticket operations
- 5-minute cache for channel configuration

**Components:**
- `src/types/teams.ts` - TypeScript interfaces
- `src/lib/teamsService.ts` - Notification service
- Integration in `new/page.tsx` and `DetailsPanel.tsx`

**Configuration:**
- Environment variable: `NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID`
- SharePoint list columns: Title, Department, TeamId, ChannelId, IsActive, MinPriority

---

### 8. Request Approval Gate 🔴
**Status:** Must Do

**Business Requirement:**
- **Request** category tickets require admin approval BEFORE appearing in support staff ticket list
- **Problem** category tickets flow through immediately (current behavior)
- Support staff can still request approval on Problem tickets when needed

**User Flow - Requests:**
1. User submits a Request ticket
2. Ticket is created with `approvalStatus: "Pending"` automatically
3. Admins receive notification and see ticket in their queue
4. Support staff do NOT see the ticket until approved
5. Admin approves → ticket becomes visible to support staff
6. Admin denies → requester notified, ticket closed/hidden

**User Flow - Problems:**
1. User submits a Problem ticket
2. Ticket flows through immediately (current behavior)
3. Support staff can optionally request approval if needed
4. No change to existing Problem workflow

**Implementation:**
- Modify ticket creation to auto-set `approvalStatus: "Pending"` for Requests
- Update ticket list filtering: support staff don't see unapproved Requests
- Update email notifications for auto-approval requests
- Add visual indicator for "Awaiting Approval" state
- Admin dashboard/queue for pending Request approvals

**Technical Notes:**
- Filter in `getTickets()` or client-side based on role + category + approvalStatus
- May need new status like "Awaiting Approval" distinct from workflow statuses

---

### 9. Assignee Preview 🔴
**Status:** Must Do

**Business Requirement:**
- When creating a ticket, show who will be assigned based on department selection
- Display job titles in hierarchical fashion (NOT email addresses)
- Look up assignee info from Entra ID (Azure AD)
- If assignee is a **group** (security group or distribution list), list ALL members' job titles

**Example Display:**
When user selects: `Tech` → `POS` → `Hardware`

Show in sidebar/preview area:
```
Assigned To:
├── IT/Audio Manager
├── IT/Audio Supervisor
└── Audio Tech
```

**Group Handling:**
- If auto-assign target is a group email (e.g., `itav@company.com`)
- Look up group membership via Graph API
- Display all members' job titles in hierarchy
- Sort by job title seniority if possible

**Implementation:**
- Extend auto-assign config to include job title hierarchy
- Query Entra for job titles of configured assignees
- If assignee is a group, query `/groups/{id}/members` for all members
- Display component in new ticket form (right side near dropdowns)
- Cache job title lookups to avoid repeated API calls
- Graceful fallback if Entra lookup fails

**Technical Notes:**
- Use Microsoft Graph `user` endpoint with `$select=jobTitle,displayName`
- Use Graph `/groups/{id}/members` for group membership
- Detect group vs user: check if email resolves to group or user in directory
- May need to store title hierarchy in SharePoint config list
- Consider caching titles with auto-assign rules (5-min cache like Teams config)

**UI/UX:**
- Show hierarchy visually (indented list or tree)
- Update dynamically as user changes department dropdowns
- Loading state while fetching from Entra
- Handle cases where no assignee is configured
- Clear indication when showing group members vs individual

---

### 10. Category Guidance 🔴
**Status:** Must Do

**Business Requirement:**
- Users need clear guidance on when to choose "Problem" vs "Request"
- This affects workflow (Requests need approval, Problems don't)
- Reduce mis-categorization and user confusion

**Problem vs Request:**
| Category | When to Use | Examples |
|----------|-------------|----------|
| **Problem** | Something is broken or not working | Equipment failure, software error, system outage, bug report |
| **Request** | Need something new or changed | New equipment, access request, software install, permission change |

**Implementation:**
- Enhance category selector in new ticket form with clear descriptions
- Add expandable help text or tooltip with examples
- Consider visual distinction (icons, colors)
- Update help documentation with detailed guidance

**UI Options:**
1. **Inline descriptions** under each radio option
2. **Info tooltip** with "Which should I choose?" link
3. **Expandable section** with examples for each
4. **Smart suggestions** based on keywords in title/description

**Help Page Update:**
- Add dedicated section explaining the difference
- Include real-world examples for each category
- Explain the workflow implications (approval for Requests)

---

### 11. Mobile App ⬜
**Status:** Planned

**Options:**
1. **PWA** - Add manifest, service worker, offline support
2. **Responsive improvements** - Better mobile layout
3. **Native app** - React Native (larger effort)

**Recommended:** Start with PWA + responsive improvements

---

### 12. Dark Mode ⬜
**Status:** Planned

**Approach:**
- Add `.theme-dark` CSS variables
- Toggle in header/settings
- Respect system preference (prefers-color-scheme)
- Persist preference in localStorage

**Note:** Theme system already uses CSS variables, making this straightforward

---

### 13. SLA Tracking ⬜
**Status:** Planned

**Features:**
- Define SLA rules by priority/category
- Visual countdown/warning on approaching SLA
- Escalation notifications
- SLA breach reporting

**Example SLAs:**
| Priority | Response Time | Resolution Time |
|----------|--------------|-----------------|
| Urgent | 1 hour | 4 hours |
| High | 4 hours | 1 day |
| Normal | 1 day | 3 days |
| Low | 2 days | 1 week |

---

### 14. Grafana Connection ⬜
**Status:** Planned

**Options:**
1. **Grafana as Dashboard** - Replace built-in dashboard entirely
2. **Hybrid** - Basic stats in-app, detailed analytics in Grafana
3. **Data export** - Push metrics to Grafana data source

**Considerations:**
- Already have Grafana infrastructure?
- Real-time vs batch data sync
- SharePoint as data source (via Azure SQL sync?)

---

### 15. App-Only Sign Out ⬜
**Status:** Explore

**Problem:**
- Current sign out clears the Microsoft token for the entire browser
- Users get signed out of other Microsoft apps (Outlook, Teams, SharePoint, etc.)
- Frustrating UX when users just want to switch accounts in Help Desk

**Desired Behavior:**
- "Sign Out" only signs out of the Help Desk app
- Other Microsoft apps in browser remain signed in
- User can sign back in with a different account if needed

**Technical Options to Explore:**

1. **Clear app-specific cache only**
   - Use `msalInstance.clearCache()` instead of `logoutRedirect()`
   - Clears tokens for this app only, not browser-wide
   - May need to clear sessionStorage keys manually

2. **Account-specific logout**
   - Use `logoutRedirect({ account: specificAccount })`
   - Only removes the specific account from MSAL cache
   - Other accounts remain available

3. **Session storage isolation**
   - MSAL config uses `sessionStorage` (already configured)
   - Tokens should be tab-specific, not shared across browser
   - Verify this is working as expected

4. **Silent token clearing**
   - Don't redirect to Microsoft logout endpoint
   - Just clear local MSAL state
   - User stays "logged in" to Microsoft, just not to Help Desk

**Considerations:**
- Security implications of not fully logging out
- SSO behavior with other tenant apps
- User expectations vs actual behavior
- May need different buttons: "Switch Account" vs "Full Sign Out"

**Research Needed:**
- Test current MSAL behavior with multiple MS apps open
- Review MSAL.js documentation for account-specific logout
- Check if `postLogoutRedirectUri` affects other apps

---

## Completed Features ✅

- [x] Core ticket viewing/management
- [x] Comment system with internal notes
- [x] RBAC (admin/support/user roles)
- [x] Approval workflow
- [x] Auto-assignment rules
- [x] User search for assignees
- [x] Custom domain (tickets.spsvent.net)
- [x] Location as required field
- [x] Performance optimizations
- [x] Favicon with SP branding
- [x] Dual theme system (Forest Adventure / Santa's Village)
- [x] Help documentation page

---

*Last updated: January 2026*
