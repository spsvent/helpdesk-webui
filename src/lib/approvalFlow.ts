// Rules governing when a ticket leaves the approval flow on category conversion.

import { ApprovalStatus, Ticket } from "@/types/ticket";

// Approval states that mean a ticket is still "awaiting" a decision — the same
// set surfaced by the "Awaiting Approval" filter. Terminal Approved / Denied
// records are preserved as history rather than cleared.
export const AWAITING_APPROVAL_STATUSES: ApprovalStatus[] = ["Pending", "Changes Requested"];

/**
 * When a ticket is converted from Request → Problem, an awaiting approval
 * (Pending or Changes Requested) should be cleared so the ticket leaves the
 * approval flow entirely. Terminal decisions (Approved / Denied) and "None" are
 * left intact. Only the Request → Problem direction triggers a clear.
 */
export function shouldClearApprovalOnConversion(
  oldCategory: Ticket["category"],
  newCategory: Ticket["category"],
  approvalStatus: ApprovalStatus
): boolean {
  return (
    oldCategory === "Request" &&
    newCategory === "Problem" &&
    AWAITING_APPROVAL_STATUSES.includes(approvalStatus)
  );
}
