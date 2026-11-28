// Quick Fix Log types + SharePoint field mapping.
//
// Two lists back this module (created by scripts/provision-fixlog-lists.mjs):
//   QuickFixLog    — one item per fix IT made without a ticket. Photos are the
//                    item's SharePoint attachments.
//   QuickFixIssues — the quick-pick tree: every row is a node; ParentId points at
//                    its folder ("" = top level). A node with children is a
//                    folder (tapping opens it); one without is a pickable issue.
// Neither list is the Tickets list, and nothing here sends a notification.

import type { SharePointListItem } from "@/shared/spTypes";

// Only IT uses the log today; stored on every row so other teams can be switched
// on later without a data migration.
export const FIXLOG_DEPARTMENT = "Tech";

export interface FixLogEntry {
  id: string;
  issue: string; // SharePoint Title — the full path, e.g. "POS › Card reader › Not reading cards"
  issueId?: string; // QuickFixIssues node id; blank for a typed "Other" issue
  category?: string; // top-level folder of the issue at log time (e.g. "POS")
  location: string;
  device?: string;
  resolution?: string; // what fixed it
  notes?: string; // anything else (e.g. what was wrong)
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
  // False when SharePoint didn't report the Attachments flag at all — the cleanup
  // refuses to trust a scan containing such a row rather than treat it as "none".
  attachmentsKnown: boolean;
  // Concurrency token for conditional (If-Match) writes by the cleanup.
  etag?: string;
  // Immutable SharePoint creator (LoggedByEmail is a plain, editable text column).
  createdByEmail: string;
  created: string; // true time the entry was saved (kept alongside a back-dated fixedAt)
  modified: string;
}

export type FixLogWritable = Partial<
  Omit<
    FixLogEntry,
    "id" | "created" | "modified" | "hasAttachments" | "attachmentsKnown" | "etag" | "createdByEmail"
  >
>;

export const FIXLOG_COLUMN_MAP: Record<keyof FixLogWritable, string> = {
  issue: "Title",
  issueId: "IssueId",
  category: "Category",
  location: "Location",
  device: "Device",
  resolution: "Resolution",
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
  parentId: string; // "" = top level
  sortOrder: number;
  active: boolean;
  department: string;
}

export type FixLogIssueWritable = Partial<Omit<FixLogIssue, "id">>;

export const FIXLOG_ISSUE_COLUMN_MAP: Record<keyof FixLogIssueWritable, string> = {
  label: "Title",
  parentId: "ParentId",
  sortOrder: "SortOrder",
  active: "Active",
  department: "Department",
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

export function mapToFixLogEntry(item: SharePointListItem): FixLogEntry {
  const f = (item.fields || {}) as Record<string, unknown>;
  // Graph returns the version as the "@odata.etag" annotation and/or an eTag property.
  const raw = item as unknown as Record<string, unknown>;
  const etag = raw["@odata.etag"] ?? raw.eTag;
  return {
    id: item.id,
    issue: str(f.Title) || "",
    issueId: str(f.IssueId),
    category: str(f.Category),
    location: str(f.Location) || "",
    device: str(f.Device),
    resolution: str(f.Resolution),
    notes: str(f.Notes),
    fixedAt: str(f.FixedAt) || item.createdDateTime,
    stationStaffName: str(f.StationStaffName),
    stationStaffEmail: str(f.StationStaffEmail),
    loggedByName: str(f.LoggedByName) || item.createdBy?.user?.displayName || "",
    loggedByEmail: str(f.LoggedByEmail) || item.createdBy?.user?.email || "",
    department: str(f.Department) || FIXLOG_DEPARTMENT,
    photoCount: typeof f.PhotoCount === "number" ? f.PhotoCount : 0,
    hasAttachments: f.Attachments === true,
    attachmentsKnown: typeof f.Attachments === "boolean",
    etag: typeof etag === "string" ? etag : undefined,
    createdByEmail: item.createdBy?.user?.email || "",
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
  };
}

export function mapToFixLogIssue(item: SharePointListItem): FixLogIssue {
  const f = (item.fields || {}) as Record<string, unknown>;
  return {
    id: item.id,
    label: str(f.Title) || "",
    parentId: str(f.ParentId) || "",
    sortOrder: typeof f.SortOrder === "number" ? f.SortOrder : 0,
    // Missing Active = active (rows added by hand in SharePoint shouldn't vanish).
    active: f.Active !== false,
    department: str(f.Department) || FIXLOG_DEPARTMENT,
  };
}
