const { config } = require("./graphHelpers");

const styles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
  .ticket-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
  .label { font-weight: 600; color: #374151; }
  .actions { text-align: center; margin: 24px 0; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 8px 8px 8px; }
  .btn-approve { background: #10b981; color: white; }
  .btn-deny { background: #ef4444; color: white; }
  .btn-changes { background: #f59e0b; color: white; }
  .btn-view { background: #1e3a5f; color: white; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-approved { background: #d1fae5; color: #065f46; }
  .badge-denied { background: #fee2e2; color: #991b1b; }
  .badge-changes { background: #ffedd5; color: #9a3412; }
  .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 14px; }
`;

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => map[c]);
}

function approveUrl(token, action) {
  // trailingSlash: true -> /approve/. action+token both in the query string.
  return `${config.appUrl}/approve/?action=${action}&token=${encodeURIComponent(token)}`;
}

// tokens: { approve, deny, changes } per-recipient signed tokens
function approvalRequestEmail(fields, ticketRef, requesterName, tokens) {
  const title = escapeHtml(fields.Title);
  const isPurchase = !!fields.IsPurchaseRequest;
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Approval Request</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p><strong>${escapeHtml(requesterName)}</strong> has requested your approval.</p>
      <div class="ticket-info">
        <h3 style="margin:0 0 8px 0;color:#1e3a5f;">${ticketRef}: ${title}</h3>
        <p><span class="label">Category:</span> ${escapeHtml(fields.Category)}</p>
        <p><span class="label">Priority:</span> ${escapeHtml(fields.Priority)}</p>
        <p><span class="label">Requester:</span> ${escapeHtml(requesterName)}</p>
        ${fields.Description ? `<p style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;">${escapeHtml(String(fields.Description).substring(0, 300))}</p>` : ""}
      </div>
      ${isPurchase ? `<div class="ticket-info"><h3 style="color:#1e3a5f;margin:0 0 8px 0;">Purchase Request</h3>
        ${fields.PurchaseJustification ? `<p><span class="label">Justification:</span> ${escapeHtml(fields.PurchaseJustification)}</p>` : ""}
        <p style="color:#6b7280;font-size:13px;">For partial approval or to order directly, open the ticket in the app.</p></div>` : ""}
      <div class="actions">
        <a href="${approveUrl(tokens.approve, "approve")}" class="btn btn-approve">Approve</a>
        <a href="${approveUrl(tokens.deny, "deny")}" class="btn btn-deny">Deny</a>
        <a href="${approveUrl(tokens.changes, "changes")}" class="btn btn-changes">Request Changes</a>
      </div>
      <p style="text-align:center;color:#6b7280;font-size:14px;">
        Or <a href="${config.appUrl}/?ticket=${fields.id}" style="color:#1e3a5f;">open the full ticket</a>.</p>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

function decisionEmail(fields, ticketRef, decision, approverName, notes) {
  const badge = decision === "Approved" ? "badge-approved" : decision === "Denied" ? "badge-denied" : "badge-changes";
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Approval Decision</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p style="text-align:center;"><span class="badge ${badge}">${escapeHtml(decision)}</span></p>
      <p>${ticketRef} — <strong>${escapeHtml(fields.Title)}</strong></p>
      <div class="ticket-info">
        <p><span class="label">Decision by:</span> ${escapeHtml(approverName)}</p>
        ${notes ? `<p style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>` : ""}
      </div>
      <div class="actions"><a href="${config.appUrl}/?ticket=${fields.id}" class="btn btn-view">View Ticket</a></div>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

function purchaseApprovedEmail(fields, ticketRef, approverName) {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Purchase Request Approved</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p style="text-align:center;"><span class="badge badge-approved">Approved</span></p>
      <p>Approved by <strong>${escapeHtml(approverName)}</strong> — ready for ordering.</p>
      <div class="ticket-info"><h3 style="margin:0 0 8px 0;color:#1e3a5f;">${ticketRef}: ${escapeHtml(fields.Title)}</h3>
        ${fields.PurchaseJustification ? `<p><span class="label">Justification:</span> ${escapeHtml(fields.PurchaseJustification)}</p>` : ""}</div>
      <div class="actions"><a href="${config.appUrl}/?ticket=${fields.id}" class="btn btn-view">View Ticket</a></div>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

function commentEmail(fields, ticketRef, commenterName, commentText) {
  const preview = String(commentText || "").substring(0, 600);
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">New Comment</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p><strong>${escapeHtml(commenterName)}</strong> replied to ${ticketRef}.</p>
      <div class="ticket-info">
        <h3 style="margin:0 0 8px 0;color:#1e3a5f;">${escapeHtml(fields.Title)}</h3>
        <p style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;white-space:pre-wrap;">${escapeHtml(preview)}</p>
      </div>
      <div class="actions"><a href="${config.appUrl}/?ticket=${fields.id}" class="btn btn-view">View Conversation</a></div>
    </div>
    <div class="footer"><p>Reply to this email to add to the conversation.</p></div>
  </div></body></html>`;
}

module.exports = { approvalRequestEmail, decisionEmail, purchaseApprovedEmail, commentEmail, escapeHtml };
