// The email-first flow only supports these three actions.
const ACTION_TO_DECISION = {
  approve: "Approved",
  deny: "Denied",
  changes: "Changes Requested",
};

function actionToDecision(action) {
  return ACTION_TO_DECISION[action] || null;
}

// Mirror of processApprovalDecision() field logic in src/lib/graphClient.ts.
// decision is "Approved" | "Denied" | "Changes Requested".
function buildDecisionFields(decision, approverName, approverEmail, notes, isPurchaseRequest, nowIso) {
  const fields = {
    ApprovalStatus: decision,
    ApprovalDate: nowIso,
    ApprovedByName: approverName,
    ApprovedByEmail: approverEmail,
  };
  if (notes) fields.ApprovalNotes = notes;

  if (isPurchaseRequest) {
    if (decision === "Approved") fields.PurchaseStatus = "Approved";
    else if (decision === "Denied") fields.PurchaseStatus = "Denied";
    // "Changes Requested" leaves PurchaseStatus unchanged
  }
  return fields;
}

// Terminal decisions lock the email links. "Changes Requested" is non-terminal.
function isTerminalStatus(approvalStatus) {
  return approvalStatus === "Approved" || approvalStatus === "Denied";
}

// Redeem-side status gate for the emailed decision links, shared by the three
// *ApprovalAction POST handlers. The mint side (the send*ApprovalRequest functions)
// only issues tokens while the item is pending — but tokens then stay valid for
// days, so the redeem side must re-check against the CURRENT status. Returns null
// when the decision may proceed, otherwise a 409-shaped body:
//   - Approved / Denied       → already_decided (with attribution) — terminal.
//   - any other non-pending   → not_pending. E.g. "Changes Requested" or "Draft":
//     the item was pulled back for revision, so a stale emailed Approve link must
//     not decide the half-revised content. Resubmitting re-enters the pending
//     state and mints fresh links.
// `pendingStatus` differs per flow ("Pending" for tickets/purchases,
// "Pending Approval" for CDWs). Call this on FRESHLY READ fields — including on
// the re-read inside the 412 (If-Match) retry loop, so the gate holds after a
// concurrent write.
function decisionConflict(currentStatus, pendingStatus, fields) {
  if (isTerminalStatus(currentStatus)) {
    return {
      reason: "already_decided",
      decidedBy: fields.ApprovedByName,
      decidedDate: fields.ApprovalDate,
    };
  }
  if (currentStatus !== pendingStatus) {
    return { reason: "not_pending", currentStatus: currentStatus || null };
  }
  return null;
}

module.exports = { actionToDecision, buildDecisionFields, isTerminalStatus, decisionConflict };
