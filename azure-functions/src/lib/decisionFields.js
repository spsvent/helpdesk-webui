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

module.exports = { actionToDecision, buildDecisionFields, isTerminalStatus };
