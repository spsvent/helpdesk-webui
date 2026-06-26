// Email templates for the CDW (creative brief) approval flow. Self-contained so
// the whole CDW feature can be removed by deleting its functions + this file.

const { config } = require("./graphHelpers");

const styles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
  .info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
  .label { font-weight: 600; color: #374151; }
  .actions { text-align: center; margin: 24px 0; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 8px 8px 8px; }
  .btn-approve { background: #10b981; color: white; }
  .btn-deny { background: #ef4444; color: white; }
  .btn-changes { background: #f59e0b; color: white; }
  .btn-view { background: #1e3a5f; color: white; }
  .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
`;

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => map[c]);
}

function actionUrl(action, token) {
  return `${config.appUrl}/cdw/approve/?action=${action}&token=${encodeURIComponent(token)}`;
}

function shell(headline, bodyHtml) {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body><div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">${headline}</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;">SkyPark Help Desk — Creative Brief</p></div>
    <div class="content">${bodyHtml}</div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p>
      <p>Please do not reply directly to this email.</p></div>
  </div></body></html>`;
}

function briefInfo(f) {
  return `<div class="info"><h3 style="margin:0 0 8px 0;color:#1e3a5f;">${escapeHtml(f.Title)}</h3>
    ${f.Deadline ? `<p><span class="label">Deadline:</span> ${escapeHtml(f.Deadline)}</p>` : ""}
    ${f.ProjectManagerName ? `<p><span class="label">Project Manager:</span> ${escapeHtml(f.ProjectManagerName)}</p>` : ""}
    ${f.QuickTake ? `<p><span class="label">Quick Take:</span><br>${escapeHtml(f.QuickTake)}</p>` : ""}
    ${f.FinalRecipientName ? `<p><span class="label">Final goes to:</span> ${escapeHtml(f.FinalRecipientName)}</p>` : ""}
  </div>`;
}

// Approval-request email with signed one-click action links.
function cdwApprovalRequestEmail(fields, who, tokens) {
  const body = `
    <p><strong>${escapeHtml(who)}</strong> has submitted a creative brief for your approval.</p>
    ${briefInfo(fields)}
    <div class="actions">
      <a href="${actionUrl("approve", tokens.approve)}" class="btn btn-approve">Approve</a>
      <a href="${actionUrl("deny", tokens.deny)}" class="btn btn-deny">Deny</a>
      <a href="${actionUrl("changes", tokens.changes)}" class="btn btn-changes">Request Changes</a>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:14px;">
      Or <a href="${config.appUrl}/cdw/?id=${fields.id}" style="color:#1e3a5f;">open the full brief</a>.</p>`;
  return shell("Creative Brief — Approval Needed", body);
}

// Decision notification (sent to requester, and on approval the final recipient).
function cdwDecisionEmail(fields, decision, approverName, notes) {
  const headline =
    decision === "Approved" ? "Creative Brief Approved"
    : decision === "Denied" ? "Creative Brief Denied"
    : "Creative Brief — Changes Requested";
  const intro =
    decision === "Approved"
      ? `<p>The creative brief <strong>${escapeHtml(fields.Title)}</strong> has been approved by <strong>${escapeHtml(approverName)}</strong> and is now finalized.</p>`
      : decision === "Denied"
      ? `<p>The creative brief <strong>${escapeHtml(fields.Title)}</strong> was denied by <strong>${escapeHtml(approverName)}</strong>.</p>`
      : `<p><strong>${escapeHtml(approverName)}</strong> requested changes to the creative brief <strong>${escapeHtml(fields.Title)}</strong>.</p>`;
  const notesHtml = notes
    ? `<p style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>`
    : "";
  const body = `${intro}${briefInfo(fields)}${notesHtml}
    <div class="actions"><a href="${config.appUrl}/cdw/?id=${fields.id}" class="btn btn-view">Open the Brief</a></div>`;
  return shell(headline, body);
}

module.exports = { cdwApprovalRequestEmail, cdwDecisionEmail };
