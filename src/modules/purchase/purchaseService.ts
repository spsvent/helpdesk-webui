// Purchase Request data service — talks to the PurchaseRequests SharePoint list.
// Mirrors src/modules/cdw/cdwService.ts; ports the purchase write/decision logic
// from graphClient.ts (retargeted off the Tickets list). Never touches Tickets.

import { Client } from "@microsoft/microsoft-graph-client";
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { ensureList, type SharePointColumnDef } from "@/shared/ensureList";
import { fetchAllListItems } from "@/shared/listItems";
import { guardedDecisionPatch, type DecisionReadResult } from "@/shared/decisionConflict";
import { serializeParticipantEmails } from "@/lib/participants";
import { getAttachments, uploadAttachment, deleteAttachment } from "@/shared/graph";
import type { Attachment } from "@/types/ticket";
import type { UserPermissions } from "@/types/rbac";
import {
  PurchaseLineItem,
  PurchaseRequest,
  PurchaseWritable,
  PURCHASE_COLUMN_MAP,
  mapToPurchase,
} from "./types";
import { purchaseUnorderedRows, purchaseUnreceivedRows } from "./queueRows";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const PURCHASE_LIST_ID = process.env.NEXT_PUBLIC_PURCHASE_LIST_ID || "";
// The Azure Function is authLevel "function": this URL must carry the key as
// ?code=<function-key> (same pattern as NEXT_PUBLIC_EMAIL_FUNCTION_URL).
const SEND_PURCHASE_APPROVAL_REQUEST_URL = process.env.NEXT_PUBLIC_SEND_PURCHASE_APPROVAL_REQUEST_URL || "";

export const PURCHASE_LIST_NAME = "PurchaseRequests";

export function isPurchaseConfigured(): boolean {
  return !!PURCHASE_LIST_ID;
}

export function serializeLineItems(items: PurchaseLineItem[]): string {
  return JSON.stringify(items);
}

// The decisions an approver can make on a purchase request.
export type PurchaseDecision =
  | "Approved"
  | "Approved with Changes"
  | "Approved & Ordered"
  | "Denied"
  | "Changes Requested";

// --- field mapping ----------------------------------------------------------

function toFields(w: PurchaseWritable): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  (Object.keys(w) as (keyof PurchaseWritable)[]).forEach((k) => {
    const value = w[k];
    if (value === undefined) return;
    // participantEmails is string[] in the model but a ";"-delimited text column.
    fields[PURCHASE_COLUMN_MAP[k]] = Array.isArray(value) ? serializeParticipantEmails(value) : value;
  });
  return fields;
}

// --- read -------------------------------------------------------------------

export async function listPurchases(client: Client): Promise<PurchaseRequest[]> {
  if (!PURCHASE_LIST_ID) return [];
  // Paged (fetchAllListItems follows @odata.nextLink): the migration runner builds
  // its idempotency set from this, so a truncated read would duplicate records.
  const endpoint = `/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items?$expand=fields&$top=1000&$orderby=createdDateTime desc`;
  const items = await fetchAllListItems(client, endpoint);
  return items.map(mapToPurchase);
}

// Purchase requests awaiting an approval decision — the purchase half of the home
// page's merged "Approvals" view/badge. Mirrors the ticket count (ApprovalStatus
// "Pending"); "Changes Requested" is excluded since it needs the requester, not the
// approver. Only meaningful for approvers (canApprovePurchase) — the caller gates.
export async function listPendingPurchaseApprovals(client: Client): Promise<PurchaseRequest[]> {
  const all = await listPurchases(client);
  return all.filter((p) => p.approvalStatus === "Pending");
}

// Header-badge counts (Awaiting Order / Awaiting Receipt). Reuse the same row
// builders the /orders and /receiving queues use so the numbers always match the
// pages. Purchases moved off the Tickets list, so these read the PurchaseRequests list.
export async function getUnorderedItemCount(client: Client): Promise<number> {
  return purchaseUnorderedRows(await listPurchases(client)).length;
}
export async function getUnreceivedItemCount(client: Client): Promise<number> {
  return purchaseUnreceivedRows(await listPurchases(client)).length;
}

export async function getPurchase(client: Client, id: string): Promise<PurchaseRequest> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  return mapToPurchase(item);
}

// Raw column values for one purchase item — the migration's verify step compares
// these against the source ticket (verifyMigration wants columns, not the model).
export async function getPurchaseFields(client: Client, id: string): Promise<Record<string, unknown>> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  return item.fields as Record<string, unknown>;
}

// A purchase request is visible to admins, purchasers, inventory (the fulfillment
// roles), and its creator/requester. Everyone else can't see it.
export function visiblePurchase(pr: PurchaseRequest, perms: UserPermissions | null): boolean {
  if (!perms) return false;
  if (perms.role === "admin" || perms.isPurchaser || perms.isInventory) return true;
  const me = perms.email.toLowerCase();
  return [pr.createdByEmail, pr.requesterEmail].filter(Boolean).some((e) => e!.toLowerCase() === me);
}

// --- write ------------------------------------------------------------------

export interface CreatePurchaseInput extends PurchaseWritable {
  lineItems: PurchaseLineItem[];
}

export async function createPurchase(client: Client, input: CreatePurchaseInput): Promise<PurchaseRequest> {
  if (!PURCHASE_LIST_ID) throw new Error("Purchase list is not configured (NEXT_PUBLIC_PURCHASE_LIST_ID)");
  const { lineItems, ...writable } = input;
  const fields = {
    ...toFields({ purchaseStatus: "Pending Approval", approvalStatus: "Pending", ...writable }),
    PurchaseLineItemsJSON: serializeLineItems(lineItems),
  };
  const created = await client.api(`/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items`).post({ fields });
  return getPurchase(client, created.id);
}

export async function updatePurchase(client: Client, id: string, patch: PurchaseWritable): Promise<PurchaseRequest> {
  if (!PURCHASE_LIST_ID) throw new Error("Purchase list is not configured");
  await client.api(`/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}`).patch({ fields: toFields(patch) });
  return getPurchase(client, id);
}

// Write line items JSON (+ optional status/notes) with a verify re-read.
// Ported from updateTicketLineItems (graphClient.ts:688).
export async function updateLineItems(
  client: Client,
  id: string,
  lineItems: PurchaseLineItem[],
  options?: { purchaseStatus?: PurchaseRequest["purchaseStatus"]; notes?: string }
): Promise<PurchaseRequest> {
  const endpoint = `/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}`;
  const json = serializeLineItems(lineItems);
  const fields: Record<string, unknown> = { PurchaseLineItemsJSON: json };
  if (options?.purchaseStatus) fields.PurchaseStatus = options.purchaseStatus;
  if (options?.notes) fields.PurchaseNotes = options.notes;

  await client.api(endpoint).patch({ fields });
  const verify = await client.api(`${endpoint}?$expand=fields`).get();
  const verifiedJson = (verify.fields as Record<string, unknown>).PurchaseLineItemsJSON as string | undefined;
  if (verifiedJson !== json) throw new Error("Line items failed to save to SharePoint. Please retry.");
  return mapToPurchase(verify);
}

export interface BulkLineItemUpdate {
  id: string;
  lineItems: PurchaseLineItem[];
  purchaseStatus?: PurchaseRequest["purchaseStatus"];
  notes?: string;
}

// Ported from bulkUpdateLineItems (graphClient.ts:786).
export async function bulkUpdateLineItems(
  client: Client,
  updates: BulkLineItemUpdate[]
): Promise<{ id: string; ok: boolean; error?: string }[]> {
  return Promise.all(
    updates.map(async (u) => {
      try {
        await updateLineItems(client, u.id, u.lineItems, { purchaseStatus: u.purchaseStatus, notes: u.notes });
        return { id: u.id, ok: true };
      } catch (e) {
        return { id: u.id, ok: false, error: e instanceof Error ? e.message : "unknown" };
      }
    })
  );
}

// Fresh read of the approval gate + ETag for the concurrency-guarded decision
// write (mirror of getPurchaseFields in the purchaseApprovalAction Function).
async function readDecisionState(client: Client, id: string): Promise<DecisionReadResult> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  const pr = mapToPurchase(item);
  return {
    status: pr.approvalStatus,
    decidedBy: pr.approvedByName,
    etag: (item["@odata.etag"] as string) || "*",
  };
}

// Record an approver decision (in-app). Ports the purchase branch of
// processApprovalDecision (graphClient.ts:614-633): maps the decision onto both the
// approval gate and the fulfillment status.
//
// Concurrency: mirrors the emailed-link Function — a fresh read + pending-only gate
// + an If-Match–conditioned PATCH (guardedDecisionPatch). If the request was already
// decided by email or another GM, this throws DecisionConflictError instead of
// silently overwriting that decision from a stale tab.
export async function recordDecision(
  client: Client,
  id: string,
  decision: PurchaseDecision,
  approverName: string,
  approverEmail: string,
  notes?: string
): Promise<PurchaseRequest> {
  const patch: PurchaseWritable = {
    approvedByName: approverName,
    approvedByEmail: approverEmail,
    approvalDate: new Date().toISOString().slice(0, 10),
  };
  if (notes) patch.approvalNotes = notes;

  switch (decision) {
    case "Approved":
      patch.approvalStatus = "Approved";
      patch.purchaseStatus = "Approved";
      break;
    case "Approved with Changes":
      patch.approvalStatus = "Approved";
      patch.purchaseStatus = "Approved with Changes";
      break;
    case "Approved & Ordered":
      patch.approvalStatus = "Approved";
      patch.purchaseStatus = "Ordered";
      patch.purchasedByEmail = approverEmail;
      patch.purchasedDate = new Date().toISOString().slice(0, 10);
      break;
    case "Denied":
      patch.approvalStatus = "Denied";
      patch.purchaseStatus = "Denied";
      break;
    case "Changes Requested":
      patch.approvalStatus = "Changes Requested";
      break;
  }

  if (!PURCHASE_LIST_ID) throw new Error("Purchase list is not configured");
  const endpoint = `/sites/${SITE_ID}/lists/${PURCHASE_LIST_ID}/items/${id}`;
  await guardedDecisionPatch({
    read: () => readDecisionState(client, id),
    patch: (etag) => client.api(endpoint).header("If-Match", etag).patch({ fields: toFields(patch) }),
    pendingStatus: "Pending",
  });
  return getPurchase(client, id);
}

// Result of a submit/resubmit: the saved request plus whether the approver email
// actually went out — callers surface a non-fatal warning when it didn't.
export interface SubmitForApprovalResult {
  purchase: PurchaseRequest;
  emailSent: boolean;
}

export async function submitForApproval(
  client: Client,
  id: string,
  requesterName: string
): Promise<SubmitForApprovalResult> {
  const updated = await updatePurchase(client, id, {
    purchaseStatus: "Pending Approval",
    approvalStatus: "Pending",
    approvalRequestedDate: new Date().toISOString().slice(0, 10),
  });
  const emailSent = await triggerPurchaseApprovalRequest(id, requesterName);
  return { purchase: updated, emailSent };
}

// POST to the Azure Function that mints kind:'purchase' tokens + emails GM approvers.
export async function triggerPurchaseApprovalRequest(purchaseId: string, requesterName: string): Promise<boolean> {
  if (!SEND_PURCHASE_APPROVAL_REQUEST_URL) {
    console.warn("[triggerPurchaseApprovalRequest] NEXT_PUBLIC_SEND_PURCHASE_APPROVAL_REQUEST_URL not set");
    return false;
  }
  try {
    const res = await fetch(SEND_PURCHASE_APPROVAL_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseId, requesterName }),
    });
    return res.ok;
  } catch (e) {
    console.error("[triggerPurchaseApprovalRequest] failed:", e);
    return false;
  }
}

// --- attachments (scoped to the purchase list) ------------------------------

export function listPurchaseAttachments(client: Client, id: string, instance: IPublicClientApplication, account: AccountInfo): Promise<Attachment[]> {
  return getAttachments(client, id, instance, account, PURCHASE_LIST_ID);
}
export function uploadPurchaseAttachment(client: Client, id: string, file: File, instance: IPublicClientApplication, account: AccountInfo): Promise<Attachment | null> {
  return uploadAttachment(client, id, file, instance, account, PURCHASE_LIST_ID);
}
export function deletePurchaseAttachment(client: Client, id: string, filename: string, instance: IPublicClientApplication, account: AccountInfo): Promise<boolean> {
  return deleteAttachment(client, id, filename, instance, account, PURCHASE_LIST_ID);
}

// --- list bootstrap (admin one-time setup) ----------------------------------

const TEXT = (name: string): SharePointColumnDef => ({ name, text: { allowMultipleLines: false, maxLength: 255 } });
const MEMO = (name: string): SharePointColumnDef => ({ name, text: { allowMultipleLines: true } });
const DATE = (name: string): SharePointColumnDef => ({ name, dateTime: { format: "dateOnly", displayAs: "default" } });
const NUM = (name: string): SharePointColumnDef => ({ name, number: {} });

const PURCHASE_COLUMNS: SharePointColumnDef[] = [
  {
    name: "PurchaseStatus",
    choice: {
      allowTextEntry: false,
      choices: ["Pending Approval", "Approved", "Approved with Changes", "Ordered", "Purchased", "Received", "Denied"],
      displayAs: "dropDownMenu",
    },
    defaultValue: { value: "Pending Approval" },
  },
  { name: "PurchaseLineItemsJSON", text: { allowMultipleLines: true } },
  MEMO("PurchaseJustification"),
  TEXT("PurchaseProject"),
  MEMO("PurchaseNotes"),
  DATE("NeedByDate"),
  DATE("PurchasedDate"),
  TEXT("PurchasedByEmail"),
  DATE("ReceivedDate"),
  MEMO("ReceivedNotes"),
  TEXT("ReceivedByEmail"),
  {
    name: "ApprovalStatus",
    choice: { allowTextEntry: false, choices: ["None", "Pending", "Approved", "Denied", "Changes Requested"], displayAs: "dropDownMenu" },
    defaultValue: { value: "None" },
  },
  DATE("ApprovalRequestedDate"),
  TEXT("ApprovedByName"),
  TEXT("ApprovedByEmail"),
  DATE("ApprovalDate"),
  MEMO("ApprovalNotes"),
  TEXT("RequesterName"),
  TEXT("RequesterEmail"),
  MEMO("ParticipantEmails"),
  NUM("SourceTicketNumber"),
  TEXT("SourceTicketId"),
  // Server-written by the sendPurchaseApprovalRequest Azure Function: last time
  // the approval-request email went out (its re-send cooldown stamp). Never
  // written by the SPA. Lists created before this column tolerate its absence.
  { name: "ApprovalRequestSentAt", dateTime: { format: "dateTime", displayAs: "default" } },
  // Server-written by the purchaseReminders timer function to throttle repeat reminders.
  { name: "LastReminderSent", dateTime: { format: "dateTime", displayAs: "default" } },
];

export async function ensurePurchaseList(client: Client): Promise<string> {
  return ensureList(client, PURCHASE_LIST_NAME, "Purchase requests (extracted from the ticket flow)", PURCHASE_COLUMNS);
}
