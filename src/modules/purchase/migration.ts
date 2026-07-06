// Pure migration mapper: a Tickets-list item (IsPurchaseRequest=true) → the input
// for a new PurchaseRequests-list record. Pure so the big-bang migration can be
// unit-tested before it touches live data. The impure runner (query Tickets, create
// PR items, verify, mark source migrated) lives in the admin action and calls this.

import { SharePointListItem } from "@/shared/spTypes";
import { parseParticipantEmails } from "@/lib/participants";
import { CreatePurchaseInput } from "./purchaseService";
import { PurchaseApprovalStatus, PurchaseStatus, parsePurchaseLineItems } from "./types";

// Extract requester email/name the same way mapToTicket does (Requester person field
// or the item creator).
function requesterEmail(item: SharePointListItem): string {
  const f = item.fields as Record<string, unknown>;
  const req = f.Requester as Record<string, unknown> | string | undefined;
  if (req && typeof req === "object" && typeof req.Email === "string") return req.Email;
  return item.createdBy?.user?.email || "";
}
function requesterName(item: SharePointListItem): string {
  const f = item.fields as Record<string, unknown>;
  const req = f.Requester as Record<string, unknown> | string | undefined;
  if (typeof req === "string") return req;
  if (req && typeof req === "object") {
    return (req.LookupValue as string) || (req.Title as string) || (req.Email as string) || item.createdBy?.user?.displayName || "";
  }
  return item.createdBy?.user?.displayName || "";
}

/**
 * Map a purchase-request Ticket item to the create-input for the PurchaseRequests list.
 * Preserves the user-facing ticket number + source id for audit/rollback.
 */
export function mapTicketItemToPurchase(item: SharePointListItem): CreatePurchaseInput {
  const f = item.fields as Record<string, unknown>;
  const str = (c: string) => (f[c] as string | undefined) || undefined;
  // Carry the ticket's notification audience over (";"-delimited column → array;
  // omitted when empty so no blank column is written).
  const participants = parseParticipantEmails(f.ParticipantEmails as string | undefined);

  return {
    lineItems: parsePurchaseLineItems(f),
    title: (f.Title as string) || "",
    purchaseStatus: (f.PurchaseStatus as PurchaseStatus) || "Pending Approval",
    justification: str("PurchaseJustification"),
    project: str("PurchaseProject"),
    notes: str("PurchaseNotes"),
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
    requesterName: requesterName(item),
    requesterEmail: requesterEmail(item),
    participantEmails: participants.length > 0 ? participants : undefined,
    sourceTicketNumber: f.TicketNumber as number | undefined,
    sourceTicketId: item.id,
  };
}

// Verify a created PR record faithfully reflects its source ticket (used by the
// migration to produce a per-item verification report). Returns a list of mismatches.
export function verifyMigration(
  source: CreatePurchaseInput,
  migratedFields: Record<string, unknown>
): string[] {
  const problems: string[] = [];
  if ((migratedFields.Title || "") !== source.title) problems.push("Title mismatch");
  if ((migratedFields.PurchaseStatus || "") !== source.purchaseStatus) problems.push("PurchaseStatus mismatch");
  const migratedItems = parsePurchaseLineItems(migratedFields);
  if (migratedItems.length !== source.lineItems.length) {
    problems.push(`line-item count ${migratedItems.length} != ${source.lineItems.length}`);
  }
  if (String(migratedFields.SourceTicketId || "") !== String(source.sourceTicketId || "")) {
    problems.push("SourceTicketId mismatch");
  }
  return problems;
}
