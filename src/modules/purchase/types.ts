// Purchase Request data model.
//
// Self-contained form module (mirrors src/modules/cdw/): built on the shared
// SharePoint envelope, NOT on the Ticket type. A purchase request runs a two-track
// state: an approval gate (approvalStatus) + a fulfillment workflow (purchaseStatus:
// Pending Approval → Approved[/with Changes] → Ordered → Purchased → Received / Denied).

import { SharePointListItem } from "@/shared/spTypes";

export type PurchaseStatus =
  | "Pending Approval"
  | "Approved"
  | "Approved with Changes"
  | "Ordered"
  | "Purchased"
  | "Received"
  | "Denied";

// The approval gate (kept alongside purchaseStatus, mirroring the current model).
export type PurchaseApprovalStatus = "None" | "Pending" | "Approved" | "Denied" | "Changes Requested";

// How the request was created: a one-off ad-hoc request, or a recurring order
// sheet built from the OrderCatalog. Drives the quiet-notification behaviour
// (catalog orders skip the immediate approval email) and the separate purchaser
// view. Absent/legacy records read as "adhoc".
export type PurchaseOrderType = "adhoc" | "catalog";

export interface PurchaseLineItem {
  // Entered by requester
  url?: string;
  name?: string;
  qty: number;
  cost: number; // estimated $/item

  // Entered by GM on "Approve & Order", or by the Purchaser later
  vendor?: string;
  orderNum?: string;
  actualCost?: number; // actual $/item if it differs
  expectedDelivery?: string; // ISO date

  // Entered by Inventory on receipt
  receivedDate?: string; // ISO date
  receivedQty?: number;

  // Set when the line originated from the order catalog (recurring order sheets).
  // The values are snapshotted from the catalog at order time so historical orders
  // keep their price/label even as the catalog changes; catalogItemId still links
  // back for vendor grouping + reorder history.
  catalogItemId?: string;
  sku?: string; // vendor product code, copied from the catalog
  unit?: string; // pack / size label copied from the catalog (e.g. "CASE", "1 GAL")
}

export interface PurchaseRequest {
  id: string;
  title: string;
  purchaseStatus: PurchaseStatus;
  lineItems: PurchaseLineItem[];
  // Recurring order-sheet tagging (unset on ad-hoc requests):
  department?: string; // owning area, matches OrderCatalogItem.department
  orderType?: PurchaseOrderType; // "adhoc" (default) | "catalog"
  justification?: string;
  project?: string;
  notes?: string;
  needByDate?: string; // ISO date (yyyy-mm-dd) — drives the need-by reminder emails
  // Ordering / receiving audit
  purchasedDate?: string;
  purchasedByEmail?: string;
  receivedDate?: string;
  receivedNotes?: string;
  receivedByEmail?: string;
  // Approval gate
  approvalStatus: PurchaseApprovalStatus;
  approvalRequestedDate?: string;
  approvedByName?: string;
  approvedByEmail?: string;
  approvalDate?: string;
  approvalNotes?: string;
  // Submitter + audience
  requesterName: string;
  requesterEmail: string;
  participantEmails?: string[];
  // Provenance (set for records migrated off the Tickets list)
  sourceTicketNumber?: number;
  sourceTicketId?: string;
  // System
  created: string;
  modified: string;
  createdByEmail: string;
  createdByName: string;
}

// Writable subset used on create/update (maps to SharePoint columns). Line items
// are written as JSON via a dedicated helper, so they're excluded here.
// participantEmails is string[] in the model; toFields serializes it to the
// ";"-delimited ParticipantEmails text column.
// A value of null clears the stored column (the same null-to-clear convention
// graphClient.ts uses for ticket columns) — the edit form relies on this so a
// blanked field doesn't silently keep its old value. Omitted (undefined) keys
// are left untouched.
export type PurchaseWritable = {
  [K in
    | "title"
    | "purchaseStatus"
    | "department"
    | "orderType"
    | "justification"
    | "project"
    | "notes"
    | "needByDate"
    | "purchasedDate"
    | "purchasedByEmail"
    | "receivedDate"
    | "receivedNotes"
    | "receivedByEmail"
    | "approvalStatus"
    | "approvalRequestedDate"
    | "approvedByName"
    | "approvedByEmail"
    | "approvalDate"
    | "approvalNotes"
    | "requesterName"
    | "requesterEmail"
    | "participantEmails"
    | "sourceTicketNumber"
    | "sourceTicketId"]?: PurchaseRequest[K] | null;
};

export const PURCHASE_COLUMN_MAP: Record<keyof PurchaseWritable, string> = {
  title: "Title",
  purchaseStatus: "PurchaseStatus",
  department: "Department",
  orderType: "OrderType",
  justification: "PurchaseJustification",
  project: "PurchaseProject",
  notes: "PurchaseNotes",
  needByDate: "NeedByDate",
  purchasedDate: "PurchasedDate",
  purchasedByEmail: "PurchasedByEmail",
  receivedDate: "ReceivedDate",
  receivedNotes: "ReceivedNotes",
  receivedByEmail: "ReceivedByEmail",
  approvalStatus: "ApprovalStatus",
  approvalRequestedDate: "ApprovalRequestedDate",
  approvedByName: "ApprovedByName",
  approvedByEmail: "ApprovedByEmail",
  approvalDate: "ApprovalDate",
  approvalNotes: "ApprovalNotes",
  requesterName: "RequesterName",
  requesterEmail: "RequesterEmail",
  participantEmails: "ParticipantEmails",
  sourceTicketNumber: "SourceTicketNumber",
  sourceTicketId: "SourceTicketId",
};

// Parse line items from the canonical PurchaseLineItemsJSON column, falling back to
// the legacy singular columns. Ported from parsePurchaseLineItems in types/ticket.ts
// so migrated records (which may still be in legacy shape) read correctly.
export function parsePurchaseLineItems(fields: Record<string, unknown>): PurchaseLineItem[] {
  const json = fields.PurchaseLineItemsJSON as string | undefined;
  if (json && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as PurchaseLineItem[];
    } catch (e) {
      console.warn("[parsePurchaseLineItems] bad PurchaseLineItemsJSON, using legacy columns:", e);
    }
  }
  const legacyUrl = fields.PurchaseItemUrl as string | undefined;
  const legacyQty = fields.PurchaseQuantity as number | undefined;
  const legacyCost = fields.PurchaseEstCostPerItem as number | undefined;
  if (legacyUrl || legacyQty != null || legacyCost != null) {
    const item: PurchaseLineItem = { url: legacyUrl, qty: legacyQty ?? 1, cost: legacyCost ?? 0 };
    if (fields.PurchaseVendor) item.vendor = fields.PurchaseVendor as string;
    if (fields.PurchaseConfirmationNum) item.orderNum = fields.PurchaseConfirmationNum as string;
    if (fields.PurchaseActualCost != null) item.actualCost = fields.PurchaseActualCost as number;
    if (fields.PurchaseExpectedDelivery) item.expectedDelivery = fields.PurchaseExpectedDelivery as string;
    if (fields.ReceivedDate) item.receivedDate = fields.ReceivedDate as string;
    return [item];
  }
  return [];
}

function splitEmails(v: unknown): string[] {
  return typeof v === "string" && v.trim()
    ? v.split(/[;,]/).map((e) => e.trim()).filter(Boolean)
    : [];
}

export function mapToPurchase(item: SharePointListItem): PurchaseRequest {
  const f = item.fields as Record<string, unknown>;
  const str = (c: string) => (f[c] as string | undefined) || undefined;
  const num = (c: string) => (f[c] as number | undefined);
  return {
    id: item.id,
    title: (f.Title as string) || "",
    purchaseStatus: (f.PurchaseStatus as PurchaseStatus) || "Pending Approval",
    lineItems: parsePurchaseLineItems(f),
    department: str("Department"),
    orderType: (f.OrderType as PurchaseOrderType) || "adhoc",
    justification: str("PurchaseJustification"),
    project: str("PurchaseProject"),
    notes: str("PurchaseNotes"),
    needByDate: str("NeedByDate"),
    purchasedDate: str("PurchasedDate"),
    purchasedByEmail: str("PurchasedByEmail"),
    receivedDate: str("ReceivedDate"),
    receivedNotes: str("ReceivedNotes"),
    receivedByEmail: str("ReceivedByEmail"),
    approvalStatus: (f.ApprovalStatus as PurchaseApprovalStatus) || "None",
    approvalRequestedDate: str("ApprovalRequestedDate"),
    approvedByName: str("ApprovedByName"),
    approvedByEmail: str("ApprovedByEmail"),
    approvalDate: str("ApprovalDate"),
    approvalNotes: str("ApprovalNotes"),
    requesterName: str("RequesterName") || item.createdBy?.user?.displayName || "",
    requesterEmail: str("RequesterEmail") || item.createdBy?.user?.email || "",
    participantEmails: splitEmails(f.ParticipantEmails),
    sourceTicketNumber: num("SourceTicketNumber"),
    sourceTicketId: str("SourceTicketId"),
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
    createdByEmail: item.createdBy?.user?.email || "",
    createdByName: item.createdBy?.user?.displayName || "",
  };
}
