const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { purchaseApprovalRequestEmail } = require("../lib/purchaseEmailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Mirror of sendCdwApprovalRequest.js for purchase requests: mints signed one-click
// tokens (kind:'purchase') and emails the GM group.
app.http("sendPurchaseApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { purchaseId, requesterName } = await request.json().catch(() => ({}));
    if (!purchaseId) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "missing_purchaseId" } };
    }
    if (!config.purchaseListId) {
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "purchase_list_not_configured" } };
    }

    try {
      const client = await getGraphClient();
      const item = await client
        .api(`/sites/${config.siteId}/lists/${config.purchaseListId}/items/${purchaseId}?$expand=fields`)
        .get();
      const fields = item.fields || {};
      fields.id = item.id;
      const who = fields.RequesterName || requesterName || "A staff member";

      // SECURITY GATE: only mint/send tokens for a request genuinely awaiting approval.
      if (fields.ApprovalStatus !== "Pending") {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "not_pending" } };
      }

      const approvers = await getGroupMembers(client, config.generalManagersGroupId);
      if (approvers.length === 0) {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "no approvers" } };
      }

      const subject = `[Approval Required] Purchase Request: ${fields.Title}`;
      let sent = 0;
      await Promise.all(approvers.map(async ({ email, displayName }) => {
        const name = displayName || email;
        const tokens = {
          approve: signToken({ tid: String(item.id), action: "approve", email, name, kind: "purchase" }),
          deny: signToken({ tid: String(item.id), action: "deny", email, name, kind: "purchase" }),
          changes: signToken({ tid: String(item.id), action: "changes", email, name, kind: "purchase" }),
        };
        const html = purchaseApprovalRequestEmail(fields, who, tokens);
        try { await sendMail(client, email, subject, html); sent++; }
        catch (e) { context.error(`purchase approval email to ${email} failed:`, e.message); }
      }));

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent } };
    } catch (error) {
      context.error("sendPurchaseApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
