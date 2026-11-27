// Quick Fix Log types + SharePoint field mapping.
//
// Two lists back this module (created by scripts/provision-fixlog-lists.mjs):
//   QuickFixLog    — one item per fix IT made without a ticket. Photos are the
//                    item's SharePoint attachments.
//   QuickFixIssues — the "common issue" quick-pick buttons, editable in the app.
// Neither list is the Tickets list, and nothing here sends a notification.

import type { SharePointListItem } from "@/shared/spTypes";

// Only IT uses the log today; stored on every row so other teams can be switched
// on later without a data migration.
export const FIXLOG_DEPARTMENT = "Tech";

export interface FixLogEntry {
  id: string;
  issue: string; // SharePoint Title
  issueId?: string; // QuickFixIssues item id; blank for a typed "Other" issue
  category?: string; // Tech sub-category copied from the issue at log time
  location: string;
  device?: string;
  notes?: string;
  fixedAt: string; // ISO — when the fix happened (may be back-dated)
  stationStaffName?: string;
  stationStaffEmail?: string;
  loggedByName: string;
  loggedByEmail: string;
  department: string;
  photoCount: number; // app-maintained; display only
  // SharePoint's built-in "Attachments" flag — authoritative "has photos", used by
  // the retention cleanup so a stale PhotoCount can't hide a photo.
  hasAttachments: boolean;
  // Immutable SharePoint creator (LoggedByEmail is a plain, editable text column).
  createdByEmail: string;
  created: string; // true time the entry was saved (kept alongside a back-dated fixedAt)
  modified: string;
}

export type FixLogWritable = Partial<
  Omit<FixLogEntry, "id" | "created" | "modified" | "hasAttachments" | "createdByEmail">
>;

export const FIXLOG_COLUMN_MAP: Record<keyof FixLogWritable, string> = {
  issue: "Title",
  issueId: "IssueId",
  category: "Category",
  location: "Location",
  device: "Device",
  notes: "Notes",
  fixedAt: "FixedAt",
  stationStaffName: "StationStaffName",
  stationStaffEmail: "StationStaffEmail",
  loggedByName: "LoggedByName",
  loggedByEmail: "LoggedByEmail",
  department: "Department",
  photoCount: "PhotoCount",
};

export interface FixLogIssue {
  id: string;
  label: string; // SharePoint Title
  category?: string;
  sortOrder: number;
  active: boolean;
  department: string;
}

export type FixLogIssueWritable = Partial<Omit<FixLogIssue, "id">>;

export const FIXLOG_ISSUE_COLUMN_MAP: Record<keyof FixLogIssueWritable, string> = {
  label: "Title",
  category: "Category",
  sortOrder: "SortOrder",
  active: "Active",
  department: "Department",
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

export function mapToFixLogEntry(item: SharePointListItem): FixLogEntry {
  const f = item.fields as Record<string, unknown>;
  return {
    id: item.id,
    issue: str(f.Title) || "",
    issueId: str(f.IssueId),
    category: str(f.Category),
    location: str(f.Location) || "",
    device: str(f.Device),
    notes: str(f.Notes),
    fixedAt: str(f.FixedAt) || item.createdDateTime,
    stationStaffName: str(f.StationStaffName),
    stationStaffEmail: str(f.StationStaffEmail),
    loggedByName: str(f.LoggedByName) || item.createdBy?.user?.displayName || "",
    loggedByEmail: str(f.LoggedByEmail) || item.createdBy?.user?.email || "",
    department: str(f.Department) || FIXLOG_DEPARTMENT,
    photoCount: typeof f.PhotoCount === "number" ? f.PhotoCount : 0,
    hasAttachments: f.Attachments === true,
    createdByEmail: item.createdBy?.user?.email || "",
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
  };
}

export function mapToFixLogIssue(item: SharePointListItem): FixLogIssue {
  const f = item.fields as Record<string, unknown>;
  return {
    id: item.id,
    label: str(f.Title) || "",
    category: str(f.Category),
    sortOrder: typeof f.SortOrder === "number" ? f.SortOrder : 0,
    // Missing Active = active (rows added by hand in SharePoint shouldn't vanish).
    active: f.Active !== false,
    department: str(f.Department) || FIXLOG_DEPARTMENT,
  };
}
