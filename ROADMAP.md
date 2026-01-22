# SkyPark Help Desk Roadmap

## Priority Order

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Search & Filtering** | ✅ Complete | Full search (ID, title, desc, requester, assignee, location) + filters |
| 2 | **File Attachments** | ✅ Complete | Upload/download/delete via SharePoint list attachments |
| 3 | **Old Ticket Migration** | ✅ Complete | PowerShell scripts migrate from Plumsail supportdesk |
| 4 | **Email Notifications** | ✅ Complete | Notify on ticket create, assignments, comments, status changes |
| 5 | **Bulk Actions** | ⬜ Planned | Admin-only: close/reassign multiple tickets |
| 6 | **Dashboard** | ⬜ Planned | Analytics, ticket counts, response times |
| 7 | **Teams Integration** | ⬜ Planned | Notifications in Teams channels |
| 8 | **Mobile App** | ⬜ Planned | PWA or responsive improvements |
| 9 | **Dark Mode** | ⬜ Planned | Manual dark/light toggle |
| 10 | **SLA Tracking** | ⬜ Planned | Due date alerts, escalation rules |
| 11 | **Grafana Connection** | ⬜ Planned | Metrics/dashboard integration (consider as main dashboard?) |

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

### 5. Bulk Actions ⬜
**Status:** Planned (Admin only)

**Actions:**
- Close multiple tickets
- Reassign multiple tickets
- Change priority/status in bulk
- Export selected tickets

**UI:**
- Checkbox selection in ticket list
- Action toolbar when items selected

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

### 7. Teams Integration ⬜
**Status:** Planned

**Features:**
- Post to channel on new high-priority tickets
- Bot commands to check ticket status
- Adaptive cards for ticket summaries
- Deep links back to Help Desk app

**Approach:**
- Incoming webhook for simple notifications
- Or full Teams app for rich integration

---

### 8. Mobile App ⬜
**Status:** Planned

**Options:**
1. **PWA** - Add manifest, service worker, offline support
2. **Responsive improvements** - Better mobile layout
3. **Native app** - React Native (larger effort)

**Recommended:** Start with PWA + responsive improvements

---

### 9. Dark Mode ⬜
**Status:** Planned

**Approach:**
- Add `.theme-dark` CSS variables
- Toggle in header/settings
- Respect system preference (prefers-color-scheme)
- Persist preference in localStorage

**Note:** Theme system already uses CSS variables, making this straightforward

---

### 10. SLA Tracking ⬜
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

### 11. Grafana Connection ⬜
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
