// Pure CDW decision helpers, extracted from cdwApprovalAction so they can be unit
// tested under `node --test` without loading the @azure/functions handler.

// Decision fields written to the CDW list item. CdwStatus mirrors the decision
// ("Approved" | "Denied" | "Changes Requested").
function buildCdwDecisionFields(decision, approverName, approverEmail, notes, nowIso) {
  const fields = {
    CdwStatus: decision,
    ApprovalDate: nowIso,
    ApprovedByName: approverName,
    ApprovedByEmail: approverEmail,
  };
  if (notes) fields.ApprovalNotes = notes;
  return fields;
}

// Who hears about the decision. Approved → the named final recipient + the
// requester; otherwise just the requester. Deduped, empties dropped, approver
// excluded (so the decider isn't emailed their own decision).
function cdwDecisionRecipients(fields, decision, approverEmail) {
  const candidates = decision === "Approved"
    ? [fields.FinalRecipientEmail, fields.RequesterEmail]
    : [fields.RequesterEmail];
  const seen = new Set([(approverEmail || "").toLowerCase()]);
  const out = [];
  for (const c of candidates) {
    const v = (c || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

module.exports = { buildCdwDecisionFields, cdwDecisionRecipients };
