// Access rules for the purchase module.

import type { UserPermissions } from "@/types/rbac";
import type { PurchaseRequest } from "./types";

// Any signed-in user can create a purchase request (it's a request).
export function canCreatePurchase(perms: UserPermissions | null): boolean {
  return !!perms;
}

// Approval gate: admins/GMs (mirrors the ticket approval permission).
export function canApprovePurchase(perms: UserPermissions | null): boolean {
  return perms?.role === "admin";
}

// A purchaser can order items once approved.
export function canPurchase(pr: PurchaseRequest, perms: UserPermissions | null): boolean {
  return !!perms?.isPurchaser && ["Approved", "Approved with Changes"].includes(pr.purchaseStatus);
}

// Inventory can receive items once ordered.
export function canReceive(pr: PurchaseRequest, perms: UserPermissions | null): boolean {
  return !!perms?.isInventory && ["Ordered", "Purchased"].includes(pr.purchaseStatus);
}

// Fulfillment statuses where money has been committed, so a cancel or a post-order
// edit must carry a reason (per the workflow: "a reason is required if it's already
// been ordered"). Everything before ordering can be changed freely.
const REASON_REQUIRED_STATUSES: PurchaseRequest["purchaseStatus"][] = ["Ordered", "Purchased", "Received"];

export function purchaseRequiresReason(status: PurchaseRequest["purchaseStatus"]): boolean {
  return REASON_REQUIRED_STATUSES.includes(status);
}

// Terminal states — nothing more can happen to the request, so cancel/edit are off.
function isPurchaseTerminal(status: PurchaseRequest["purchaseStatus"]): boolean {
  return status === "Cancelled" || status === "Denied";
}

// Who may cancel or edit a request at ANY point in the flow: the owner
// (creator/requester), an admin/GM, or a purchaser (they own post-approval
// fulfillment). Blocked once the request is already terminal (Cancelled/Denied).
function isPurchaseActor(
  pr: Pick<PurchaseRequest, "createdByEmail" | "requesterEmail">,
  perms: UserPermissions | null
): boolean {
  if (!perms) return false;
  if (perms.role === "admin" || perms.isPurchaser) return true;
  const me = perms.email.toLowerCase();
  return [pr.createdByEmail, pr.requesterEmail].some((e) => e && e.toLowerCase() === me);
}

// Cancel a request at any live point in the flow.
export function canCancelPurchase(pr: PurchaseRequest, perms: UserPermissions | null): boolean {
  return isPurchaseActor(pr, perms) && !isPurchaseTerminal(pr.purchaseStatus);
}

// Edit a request past the pre-approval window (broader than the isPurchaseEditable
// gate below). Admins/approvers and purchasers may edit at any live stage. The
// requester (owner) may edit only BEFORE the request is approved — once it has been
// approved, the owner is locked out and only an admin/approver or purchaser can
// change the order. Post-order edits require a reason at save time.
export function canEditPurchaseAnytime(pr: PurchaseRequest, perms: UserPermissions | null): boolean {
  if (!perms) return false;
  if (isPurchaseTerminal(pr.purchaseStatus)) return false;
  if (perms.role === "admin" || perms.isPurchaser) return true;
  // Owner: allowed only while the request hasn't been approved yet.
  if (pr.approvalStatus === "Approved") return false;
  const me = perms.email.toLowerCase();
  return [pr.createdByEmail, pr.requesterEmail].some((e) => e && e.toLowerCase() === me);
}

// Owner (creator/requester) or admin — for editing a draft/changes-requested request.
export function canEditPurchase(
  pr: Pick<PurchaseRequest, "createdByEmail" | "requesterEmail">,
  perms: UserPermissions | null
): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  const me = perms.email.toLowerCase();
  return [pr.createdByEmail, pr.requesterEmail].some((e) => e && e.toLowerCase() === me);
}

// Status gate for edits (there is no Draft: new requests submit straight to the
// approval queue). Editable only when the approver bounced it ("Changes
// Requested") or it never entered the gate ("None" + still Pending Approval —
// e.g. a migrated record that was never submitted). A request that is Pending,
// Approved, or Denied is immutable; resubmitting (submitForApproval) is the only
// way back into the queue.
export function isPurchaseEditable(
  pr: Pick<PurchaseRequest, "approvalStatus" | "purchaseStatus">
): boolean {
  if (pr.approvalStatus === "Changes Requested") return true;
  return pr.approvalStatus === "None" && pr.purchaseStatus === "Pending Approval";
}
