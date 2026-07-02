// CDW (Campaign & Creative Development Worksheet) data model.
//
// Self-contained: built on the shared SharePoint envelope, NOT on the Ticket type.
// A CDW is a creative brief that must be approved by a GM/admin before it goes
// "public" (status === "Approved"), and it names who receives the final deliverable.

import { SharePointListItem } from "@/shared/spTypes";
import type { UserPermissions } from "@/types/rbac";

export const CDW_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Denied",
  "Changes Requested",
] as const;
export type CdwStatus = (typeof CDW_STATUSES)[number];

// A brief is visible to everyone only once it reaches this status ("public").
export const CDW_PUBLIC_STATUS: CdwStatus = "Approved";

// The three terminal/active approval decisions. These deliberately share their
// names with the matching CdwStatus values, so a decision IS a status — writers
// assign a CdwDecision straight to `status` (the subtype relation is checked by
// the compiler; no mapping function needed).
export type CdwDecision = "Approved" | "Denied" | "Changes Requested";

// Statuses in which a brief's CONTENT may still be edited — i.e. while it's in the
// requester's hands. Once it enters the approval queue ("Pending Approval") or has
// been decided ("Approved"/"Denied") the content is frozen: editing then would keep
// the status — and any "Approved by X" attribution — attached to rewritten text.
// Single source of truth shared by CdwForm (hard gate on the edit route) and
// CdwDetail (which only offers the Edit button for these statuses).
export const CDW_EDITABLE_STATUSES: readonly CdwStatus[] = ["Draft", "Changes Requested"];

export function isEditableCdwStatus(status: CdwStatus): boolean {
  return CDW_EDITABLE_STATUSES.includes(status);
}

export interface CDWBrief {
  id: string;
  title: string; // Project Name
  status: CdwStatus;
  deadline?: string; // ISO date (yyyy-mm-dd)
  projectManagerName?: string;
  projectManagerEmail?: string;
  pmContact?: string;
  campaign?: string;
  quickTake?: string;
  communicationPriorities?: string;
  callToAction?: string;
  secondaryInfo?: string;
  audience?: string;
  specifications?: string;
  additionalDetails?: string;
  projectTimeline?: string;
  approvalsNote?: string;
  // Who should be given the final deliverable once approved.
  finalRecipientName?: string;
  finalRecipientEmail?: string;
  // Submitter
  requesterName: string;
  requesterEmail: string;
  // Approval workflow
  approvalRequestedDate?: string;
  approvedByName?: string;
  approvedByEmail?: string;
  approvalDate?: string;
  approvalNotes?: string;
  // System
  created: string;
  modified: string;
  createdByEmail: string;
  createdByName: string;
}

// Writable subset used when creating/updating (maps to SharePoint columns).
// A value of null clears the stored column (the same null-to-clear convention
// graphClient.ts uses for ticket columns) — the edit form relies on this so a
// blanked field or removed person doesn't silently keep its old value. Omitted
// (undefined) keys are left untouched.
export type CdwWritable = {
  [K in
    | "title"
    | "status"
    | "deadline"
    | "projectManagerName"
    | "projectManagerEmail"
    | "pmContact"
    | "campaign"
    | "quickTake"
    | "communicationPriorities"
    | "callToAction"
    | "secondaryInfo"
    | "audience"
    | "specifications"
    | "additionalDetails"
    | "projectTimeline"
    | "approvalsNote"
    | "finalRecipientName"
    | "finalRecipientEmail"
    | "requesterName"
    | "requesterEmail"
    | "approvalRequestedDate"
    | "approvedByName"
    | "approvedByEmail"
    | "approvalDate"
    | "approvalNotes"]?: CDWBrief[K] | null;
};

// CDWBrief field <-> SharePoint column name. Single source of truth for read
// (mapToCdw) and write (toFields in cdwService).
export const CDW_COLUMN_MAP: Record<keyof CdwWritable, string> = {
  title: "Title",
  status: "CdwStatus",
  deadline: "Deadline",
  projectManagerName: "ProjectManagerName",
  projectManagerEmail: "ProjectManagerEmail",
  pmContact: "PmContact",
  campaign: "Campaign",
  quickTake: "QuickTake",
  communicationPriorities: "CommunicationPriorities",
  callToAction: "CallToAction",
  secondaryInfo: "SecondaryInfo",
  audience: "Audience",
  specifications: "Specifications",
  additionalDetails: "AdditionalDetails",
  projectTimeline: "ProjectTimeline",
  approvalsNote: "ApprovalsNote",
  finalRecipientName: "FinalRecipientName",
  finalRecipientEmail: "FinalRecipientEmail",
  requesterName: "RequesterName",
  requesterEmail: "RequesterEmail",
  approvalRequestedDate: "ApprovalRequestedDate",
  approvedByName: "ApprovedByName",
  approvedByEmail: "ApprovedByEmail",
  approvalDate: "ApprovalDate",
  approvalNotes: "ApprovalNotes",
};

// Visibility: a brief is visible to everyone once "public" (Approved). Before that
// it is visible only to admins (the approvers), its creator, requester, or named PM.
// Pure so it can be unit-tested without the Graph client.
export function visibleCdw(brief: CDWBrief, perms: UserPermissions | null): boolean {
  if (brief.status === CDW_PUBLIC_STATUS) return true;
  if (!perms) return false;
  if (perms.role === "admin") return true;
  const me = perms.email.toLowerCase();
  return [brief.createdByEmail, brief.requesterEmail, brief.projectManagerEmail]
    .filter(Boolean)
    .some((e) => e!.toLowerCase() === me);
}

export function mapToCdw(item: SharePointListItem): CDWBrief {
  const f = item.fields as Record<string, unknown>;
  const str = (col: string) => (f[col] as string | undefined) || undefined;
  return {
    id: item.id,
    title: (f.Title as string) || "",
    status: (f.CdwStatus as CdwStatus) || "Draft",
    deadline: str("Deadline"),
    projectManagerName: str("ProjectManagerName"),
    projectManagerEmail: str("ProjectManagerEmail"),
    pmContact: str("PmContact"),
    campaign: str("Campaign"),
    quickTake: str("QuickTake"),
    communicationPriorities: str("CommunicationPriorities"),
    callToAction: str("CallToAction"),
    secondaryInfo: str("SecondaryInfo"),
    audience: str("Audience"),
    specifications: str("Specifications"),
    additionalDetails: str("AdditionalDetails"),
    projectTimeline: str("ProjectTimeline"),
    approvalsNote: str("ApprovalsNote"),
    finalRecipientName: str("FinalRecipientName"),
    finalRecipientEmail: str("FinalRecipientEmail"),
    requesterName: str("RequesterName") || item.createdBy?.user?.displayName || "",
    requesterEmail: str("RequesterEmail") || item.createdBy?.user?.email || "",
    approvalRequestedDate: str("ApprovalRequestedDate"),
    approvedByName: str("ApprovedByName"),
    approvedByEmail: str("ApprovedByEmail"),
    approvalDate: str("ApprovalDate"),
    approvalNotes: str("ApprovalNotes"),
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
    createdByEmail: item.createdBy?.user?.email || "",
    createdByName: item.createdBy?.user?.displayName || "",
  };
}
