// Email templates for the purchase-request approval flow. Self-contained so the
// whole module can be removed by deleting its functions + this file.

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
  return `${config.appUrl}/purchase/approve/?action=${action}&token=${encodeURIComponent(token)}`;
}

function parseItems(fields) {
  try {
    const arr = JSON.parse(fields.PurchaseLineItemsJSON || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function shell(headline, bodyHtml) {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body><div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">${headline}</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;">SkyPark Help Desk — Purchase Request</p></div>
    <div class="content">${bodyHtml}</div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p>
      <p>Please do not reply directly to this email.</p></div>
  </div></body></html>`;
}

function itemsTable(fields) {
  const items = parseItems(fields);
  if (!items.length) return "";
  const rows = items
    .map(
      (it) =>
        `<tr><td style="padding:4px 8px;">${escapeHtml(it.name || it.url || "item")}</td>
         <td style="padding:4px 8px;text-align:right;">${it.qty ?? ""}</td>
         <td style="padding:4px 8px;text-align:right;">$${Number(it.cost || 0).toFixed(2)}</td></tr>`
    )
    .join("");
  const total = items.reduce((s, it) => s + (it.qty || 0) * (it.cost || 0), 0);
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
    <tr><th align="left" style="padding:4px 8px;">Item</th><th style="padding:4px 8px;">Qty</th><th style="padding:4px 8px;">Est. $/ea</th></tr>
    ${rows}
    <tr><td colspan="3" style="padding:6px 8px;text-align:right;font-weight:600;">Est. total: $${total.toFixed(2)}</td></tr>
  </table>`;
}

function info(fields) {
  return `<div class="info"><h3 style="margin:0 0 8px 0;color:#1e3a5f;">${escapeHtml(fields.Title)}</h3>
    ${fields.PurchaseJustification ? `<p><span class="label">Justification:</span> ${escapeHtml(fields.PurchaseJustification)}</p>` : ""}
    ${fields.PurchaseProject ? `<p><span class="label">Project:</span> ${escapeHtml(fields.PurchaseProject)}</p>` : ""}
    ${itemsTable(fields)}</div>`;
}

function purchaseApprovalRequestEmail(fields, who, tokens) {
  const body = `
    <p><strong>${escapeHtml(who)}</strong> has submitted a purchase request for your approval.</p>
    ${info(fields)}
    <div class="actions">
      <a href="${actionUrl("approve", tokens.approve)}" class="btn btn-approve">Approve</a>
      <a href="${actionUrl("deny", tokens.deny)}" class="btn btn-deny">Deny</a>
      <a href="${actionUrl("changes", tokens.changes)}" class="btn btn-changes">Request Changes</a>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:14px;">
      For "approve with changes" or "approve &amp; order", <a href="${config.appUrl}/purchase?id=${fields.id}" style="color:#1e3a5f;">open the request</a>.</p>`;
  return shell("Purchase Request — Approval Needed", body);
}

function purchaseDecisionEmail(fields, decision, approverName, notes) {
  const headline =
    decision === "Approved" ? "Purchase Request Approved"
    : decision === "Denied" ? "Purchase Request Denied"
    : "Purchase Request — Changes Requested";
  const intro = `<p>Your purchase request <strong>${escapeHtml(fields.Title)}</strong> was <strong>${escapeHtml(decision)}</strong> by <strong>${escapeHtml(approverName)}</strong>.</p>`;
  const notesHtml = notes
    ? `<p style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>`
    : "";
  return shell(headline, `${intro}${info(fields)}${notesHtml}
    <div class="actions"><a href="${config.appUrl}/purchase?id=${fields.id}" class="btn btn-view">Open the Request</a></div>`);
}

function purchaseApprovedForPurchaserEmail(fields, approverName) {
  const body = `<p>A purchase request was approved by <strong>${escapeHtml(approverName)}</strong> and is ready to order.</p>
    ${info(fields)}
    <div class="actions"><a href="${config.appUrl}/orders" class="btn btn-view">Open the order queue</a></div>`;
  return shell("Purchase Approved — Ready to Order", body);
}

// One row in a reminder digest: a linked request title + a light summary line.
function reminderDigestRow(fields) {
  const items = parseItems(fields);
  const total = items.reduce((s, it) => s + (it.qty || 0) * (it.cost || 0), 0);
  const who = fields.RequesterName ? ` · ${escapeHtml(fields.RequesterName)}` : "";
  const needBy = fields.NeedByDate
    ? ` · <span style="color:#b45309;">needed by ${escapeHtml(fields.NeedByDate)}</span>`
    : "";
  return `<tr><td style="padding:8px;border-bottom:1px solid #eee;">
    <a href="${config.appUrl}/purchase?id=${fields.id}" style="color:#1e3a5f;font-weight:600;">${escapeHtml(fields.Title || "Untitled")}</a>
    <div style="color:#6b7280;font-size:13px;">${items.length} item${items.length === 1 ? "" : "s"} · est. $${total.toFixed(2)}${who}${needBy}</div>
  </td></tr>`;
}

// Daily DIGEST reminder (purchaseReminders.js): ONE email per audience summarizing
// every request that needs that action, instead of one email per request.
//   approval → General Managers · order → Purchasers · receive → Inventory / requester
// `records` is an array of SharePoint `fields` objects (each with .id set).
function purchaseReminderDigestEmail(kind, records) {
  const copy = {
    approval: {
      headline: "Purchase Requests Awaiting Approval",
      noun: "awaiting your approval",
      cta: { href: `${config.appUrl}/purchase`, label: "Review Purchase Requests" },
    },
    order: {
      headline: "Approved Purchases Awaiting Order",
      noun: "approved and not yet ordered",
      cta: { href: `${config.appUrl}/orders`, label: "Open the order queue" },
    },
    receive: {
      headline: "Items Awaiting Receipt",
      noun: "with items not yet marked received",
      cta: { href: `${config.appUrl}/receiving`, label: "Open the receiving queue" },
    },
  }[kind];
  if (!copy || !records.length) return null;
  const n = records.length;
  const rows = records.map(reminderDigestRow).join("");
  const body = `<p>There ${n === 1 ? "is" : "are"} <strong>${n}</strong> purchase request${n === 1 ? "" : "s"} ${copy.noun}:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">${rows}</table>
    <div class="actions"><a href="${copy.cta.href}" class="btn btn-view">${copy.cta.label}</a></div>`;
  return shell(copy.headline, body);
}

module.exports = {
  purchaseApprovalRequestEmail,
  purchaseDecisionEmail,
  purchaseApprovedForPurchaserEmail,
  purchaseReminderDigestEmail,
};
