// Split a delimited ParticipantEmails string ("; " or "," separated) into emails.
function splitEmails(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
}

// fields: raw SharePoint ticket fields. commenterEmails: emails of prior commenters.
// excludeEmail: the actor (approver) to omit. Returns a deduped lowercase array.
function resolveDecisionRecipients(fields, commenterEmails, excludeEmail) {
  const out = new Set();
  const add = (e) => { if (e && typeof e === "string" && e.trim()) out.add(e.trim().toLowerCase()); };

  add(fields.RequesterEmail);
  add(fields.OriginalRequester);
  add(fields.OriginalAssignedTo);
  add(fields.ApprovalRequestedByEmail);
  add(fields.ApprovedByEmail);
  for (const e of splitEmails(fields.ParticipantEmails)) add(e);
  for (const e of commenterEmails || []) add(e);

  if (excludeEmail) out.delete(excludeEmail.trim().toLowerCase());
  return [...out];
}

module.exports = { resolveDecisionRecipients, splitEmails };
