// Pure purchase-decision helpers for the email one-click approval path. Extracted so
// they're unit-testable under `node --test`. The email path supports only the three
// generic decisions (Approve / Deny / Request Changes); "Approve with Changes" and
// "Approve & Ordered" need the in-app item/vendor UI and are handled there.

// Writes both the approval gate (ApprovalStatus) and the fulfillment status
// (PurchaseStatus), matching the in-app recordDecision + the old ticket flow.
function buildPurchaseDecisionFields(decision, approverName, approverEmail, notes, nowIso) {
  const fields = {
    ApprovalStatus: decision,
    ApprovalDate: nowIso,
    ApprovedByName: approverName,
    ApprovedByEmail: approverEmail,
  };
  if (decision === "Approved") fields.PurchaseStatus = "Approved";
  else if (decision === "Denied") fields.PurchaseStatus = "Denied";
  // "Changes Requested" leaves PurchaseStatus unchanged.
  if (notes) fields.ApprovalNotes = notes;
  return fields;
}

// Requester (+ participants) hear about every decision; the approver is excluded.
function purchaseDecisionRecipients(fields, approverEmail) {
  const seen = new Set([(approverEmail || "").toLowerCase()]);
  const out = [];
  const participants =
    typeof fields.ParticipantEmails === "string"
      ? fields.ParticipantEmails.split(/[;,]/).map((e) => e.trim())
      : [];
  for (const c of [fields.RequesterEmail, ...participants]) {
    const v = (c || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

module.exports = { buildPurchaseDecisionFields, purchaseDecisionRecipients };
