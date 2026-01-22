# SkyPark Help Desk Roadmap

## Priority Order

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Search & Filtering** | 🟡 In Progress | Basic filtering exists, needs full-text search |
| 2 | **File Attachments** | ⬜ Planned | Upload files to tickets via SharePoint |
| 3 | **Old Ticket Migration** | ⬜ Planned | Import historical tickets from previous system |
| 4 | **Email Notifications** | ⬜ Planned | Notify on updates, comments, assignments |
| 5 | **Bulk Actions** | ⬜ Planned | Admin-only: close/reassign multiple tickets |
| 6 | **Dashboard** | ⬜ Planned | Analytics, ticket counts, response times |
| 7 | **Teams Integration** | ⬜ Planned | Notifications in Teams channels |
| 8 | **Mobile App** | ⬜ Planned | PWA or responsive improvements |
| 9 | **Dark Mode** | ⬜ Planned | Manual dark/light toggle |
| 10 | **SLA Tracking** | ⬜ Planned | Due date alerts, escalation rules |
| 11 | **Grafana Connection** | ⬜ Planned | Metrics/dashboard integration (consider as main dashboard?) |

---

## Feature Details

### 1. Search & Filtering 🟡
**Status:** Partially complete

**Current:**
- Filter by status (All, Open, My Tickets)
- Sort by date

**Needed:**
- Full-text search across title/description
- Filter by department, priority, assignee
- Date range filtering
- Save filter presets

---

### 2. File Attachments ⬜
**Status:** Planned

**Approach:**
- Use SharePoint document library for storage
- Link attachments to tickets via metadata
- Support common file types (images, PDFs, docs)
- Display inline previews where possible

**Considerations:**
- File size limits
- Virus scanning (SharePoint built-in)
- Permission inheritance from ticket

---

### 3. Old Ticket Migration ⬜
**Status:** Planned

**Approach:**
- PowerShell script to import from source system
- Map old fields to new SharePoint schema
- Preserve timestamps, comments, attachments
- Mark as "Migrated" for audit trail

**Source systems to support:**
- TBD (Excel? Previous ticketing system?)

---

### 4. Email Notifications ⬜
**Status:** Planned

**Triggers:**
- New ticket created (to assignee)
- Ticket assigned/reassigned
- New comment added
- Status changed
- Approval requested/decided

**Approach:**
- Microsoft Graph API sendMail
- Template-based emails
- User preference for notification frequency

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
