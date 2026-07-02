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
