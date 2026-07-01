// CDW data service — talks to the CDW's OWN SharePoint list. Mirrors the small
// self-contained service pattern used by rbacConfigService / visibilityKeywordsService,
// but for the CDW form module. Never touches the Tickets list.

import { Client } from "@microsoft/microsoft-graph-client";
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { ensureList, type SharePointColumnDef } from "@/shared/ensureList";
import { fetchAllListItems } from "@/shared/listItems";
import { guardedDecisionPatch, type DecisionReadResult } from "@/shared/decisionConflict";
import { getAttachments, uploadAttachment, deleteAttachment } from "@/shared/graph";
import type { Attachment } from "@/types/ticket";
import {
  CDWBrief,
  CdwDecision,
  CdwWritable,
  CDW_COLUMN_MAP,
  CDW_STATUSES,
  decisionToStatus,
  mapToCdw,
  visibleCdw,
} from "./types";

// Re-exported so components keep importing visibility from the service.
export { visibleCdw };

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const CDW_LIST_ID = process.env.NEXT_PUBLIC_CDW_LIST_ID || "";
// The Azure Function is authLevel "function": this URL must carry the key as
// ?code=<function-key> (same pattern as NEXT_PUBLIC_EMAIL_FUNCTION_URL).
const SEND_CDW_APPROVAL_REQUEST_URL = process.env.NEXT_PUBLIC_SEND_CDW_APPROVAL_REQUEST_URL || "";

// Display name used when bootstrapping the list (ensureCdwList).
export const CDW_LIST_NAME = "CDWBriefs";

export function isCdwConfigured(): boolean {
  return !!CDW_LIST_ID;
}

// --- field mapping ----------------------------------------------------------

function toFields(w: CdwWritable): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  (Object.keys(w) as (keyof CdwWritable)[]).forEach((k) => {
    const value = w[k];
    if (value !== undefined) fields[CDW_COLUMN_MAP[k]] = value;
  });
  return fields;
}

// --- read -------------------------------------------------------------------

export async function listCdw(client: Client): Promise<CDWBrief[]> {
  if (!CDW_LIST_ID) return [];
  // Paged (fetchAllListItems follows @odata.nextLink) so briefs past the first
  // Graph page don't silently vanish from the list view.
  const endpoint = `/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items?$expand=fields&$top=500&$orderby=createdDateTime desc`;
  const items = await fetchAllListItems(client, endpoint);
  return items.map(mapToCdw);
}

export async function getCdw(client: Client, id: string): Promise<CDWBrief> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  return mapToCdw(item);
}

// --- write ------------------------------------------------------------------

export async function createCdw(client: Client, input: CdwWritable): Promise<CDWBrief> {
  if (!CDW_LIST_ID) throw new Error("CDW list is not configured (NEXT_PUBLIC_CDW_LIST_ID)");
  const fields = toFields({ status: "Draft", ...input });
  const created = await client
    .api(`/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items`)
    .post({ fields });
  return getCdw(client, created.id);
}

export async function updateCdw(client: Client, id: string, patch: CdwWritable): Promise<CDWBrief> {
  if (!CDW_LIST_ID) throw new Error("CDW list is not configured (NEXT_PUBLIC_CDW_LIST_ID)");
  await client
    .api(`/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items/${id}`)
    .patch({ fields: toFields(patch) });
  return getCdw(client, id);
}

// Result of a submit/resubmit: the saved brief plus whether the approver email
// actually went out — callers surface a non-fatal warning when it didn't.
export interface SubmitForApprovalResult {
  brief: CDWBrief;
  emailSent: boolean;
}

// Move a brief into the approval queue and ask the server to email the GM group
// the signed one-click approve/deny/changes links.
export async function submitForApproval(
  client: Client,
  id: string,
  requesterName: string
): Promise<SubmitForApprovalResult> {
  const updated = await updateCdw(client, id, {
    status: "Pending Approval",
    // Date-only to match the dateOnly SharePoint column (avoids a TZ off-by-one).
    approvalRequestedDate: new Date().toISOString().slice(0, 10),
  });
  const emailSent = await triggerCdwApprovalRequest(id, requesterName);
  return { brief: updated, emailSent };
}

// Fresh read of the brief's status + ETag for the concurrency-guarded decision
// write (mirror of getCdwFields in the cdwApprovalAction Function).
async function readDecisionState(client: Client, id: string): Promise<DecisionReadResult> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  const brief = mapToCdw(item);
  return {
    status: brief.status,
    decidedBy: brief.approvedByName,
    etag: (item["@odata.etag"] as string) || "*",
  };
}

// Record an in-app approver decision (the email path is handled by the Azure
// Function). On "Approved" the brief becomes public.
//
// Concurrency: mirrors the emailed-link Function — a fresh read + pending-only gate
// + an If-Match–conditioned PATCH (guardedDecisionPatch). If the brief was already
// decided by email or another GM, this throws DecisionConflictError instead of
// silently overwriting that decision from a stale tab.
export async function recordDecision(
  client: Client,
  id: string,
  decision: CdwDecision,
  approverName: string,
  approverEmail: string,
  notes?: string
): Promise<CDWBrief> {
  if (!CDW_LIST_ID) throw new Error("CDW list is not configured (NEXT_PUBLIC_CDW_LIST_ID)");
  const patch: CdwWritable = {
    status: decisionToStatus(decision),
    approvedByName: approverName,
    approvedByEmail: approverEmail,
    // Date-only to match the dateOnly SharePoint column (avoids a TZ off-by-one).
    approvalDate: new Date().toISOString().slice(0, 10),
  };
  if (notes) patch.approvalNotes = notes;

  const endpoint = `/sites/${SITE_ID}/lists/${CDW_LIST_ID}/items/${id}`;
  await guardedDecisionPatch({
    read: () => readDecisionState(client, id),
    patch: (etag) => client.api(endpoint).header("If-Match", etag).patch({ fields: toFields(patch) }),
    pendingStatus: "Pending Approval",
  });
  return getCdw(client, id);
}

// POST to the Azure Function that mints signed tokens + emails the GM approvers.
// Mirrors triggerApprovalRequestEmail() for tickets. Silent no-op if unconfigured.
export async function triggerCdwApprovalRequest(
  cdwId: string,
  requesterName: string
): Promise<boolean> {
  if (!SEND_CDW_APPROVAL_REQUEST_URL) {
    console.warn("[triggerCdwApprovalRequest] NEXT_PUBLIC_SEND_CDW_APPROVAL_REQUEST_URL not set");
    return false;
  }
  try {
    const res = await fetch(SEND_CDW_APPROVAL_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cdwId, requesterName }),
    });
    return res.ok;
  } catch (e) {
    console.error("[triggerCdwApprovalRequest] failed:", e);
    return false;
  }
}

// --- attachments (scoped to the CDW list) -----------------------------------

export function listCdwAttachments(
  client: Client,
  id: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Attachment[]> {
  return getAttachments(client, id, instance, account, CDW_LIST_ID);
}

export function uploadCdwAttachment(
  client: Client,
  id: string,
  file: File,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Attachment | null> {
  return uploadAttachment(client, id, file, instance, account, CDW_LIST_ID);
}

export function deleteCdwAttachment(
  client: Client,
  id: string,
  filename: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<boolean> {
  return deleteAttachment(client, id, filename, instance, account, CDW_LIST_ID);
}

// --- list bootstrap (admin one-time setup) ----------------------------------

const TEXT = (name: string): SharePointColumnDef => ({
  name,
  text: { allowMultipleLines: false, maxLength: 255 },
});
const MEMO = (name: string): SharePointColumnDef => ({
  name,
  text: { allowMultipleLines: true, appendChangesToExistingText: false },
});
const DATE = (name: string): SharePointColumnDef => ({
  name,
  dateTime: { format: "dateOnly", displayAs: "default" },
});

const CDW_COLUMNS: SharePointColumnDef[] = [
  {
    name: "CdwStatus",
    choice: { allowTextEntry: false, choices: [...CDW_STATUSES], displayAs: "dropDownMenu" },
    defaultValue: { value: "Draft" },
  },
  DATE("Deadline"),
  TEXT("ProjectManagerName"),
  TEXT("ProjectManagerEmail"),
  TEXT("PmContact"),
  MEMO("Campaign"),
  MEMO("QuickTake"),
  MEMO("CommunicationPriorities"),
  MEMO("CallToAction"),
  MEMO("SecondaryInfo"),
  MEMO("Audience"),
  MEMO("Specifications"),
  MEMO("AdditionalDetails"),
  MEMO("ProjectTimeline"),
  MEMO("ApprovalsNote"),
  TEXT("FinalRecipientName"),
  TEXT("FinalRecipientEmail"),
  TEXT("RequesterName"),
  TEXT("RequesterEmail"),
  DATE("ApprovalRequestedDate"),
  TEXT("ApprovedByName"),
  TEXT("ApprovedByEmail"),
  DATE("ApprovalDate"),
  MEMO("ApprovalNotes"),
  // Server-written by the sendCdwApprovalRequest Azure Function: last time the
  // approval-request email went out (its re-send cooldown stamp). Never written
  // by the SPA. Lists created before this column tolerate its absence.
  { name: "ApprovalRequestSentAt", dateTime: { format: "dateTime", displayAs: "default" } },
];

// Idempotently create the CDW list + columns. Returns the list id — put it in
// NEXT_PUBLIC_CDW_LIST_ID (and the Function App's CDW_LIST_ID) and redeploy.
export async function ensureCdwList(client: Client): Promise<string> {
  return ensureList(client, CDW_LIST_NAME, "CDW creative briefs (Campaign & Creative Development Worksheet)", CDW_COLUMNS);
}
