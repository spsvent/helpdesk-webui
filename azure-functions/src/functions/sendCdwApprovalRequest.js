const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { cdwApprovalRequestEmail } = require("../lib/cdwEmailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Mirror of sendApprovalRequest.js, but for CDW creative briefs: mints signed
// one-click tokens (tagged kind:'cdw') and emails the GM group.
app.http("sendCdwApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { cdwId, requesterName } = await request.json().catch(() => ({}));
    if (!cdwId) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "missing_cdwId" } };
    }
    if (!config.cdwListId) {
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "cdw_list_not_configured" } };
    }

    try {
      const client = await getGraphClient();
      const item = await client
        .api(`/sites/${config.siteId}/lists/${config.cdwListId}/items/${cdwId}?$expand=fields`)
        .get();
      const fields = item.fields || {};
      fields.id = item.id;
      const who = fields.RequesterName || requesterName || "A staff member";

      // SECURITY GATE: anonymous endpoint — only mint/send tokens for a brief that
      // is genuinely Pending Approval (mirrors the ticket flow's gate).
      if (fields.CdwStatus !== "Pending Approval") {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "not_pending" } };
      }

      const approvers = await getGroupMembers(client, config.generalManagersGroupId);
      if (approvers.length === 0) {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "no approvers" } };
      }

      const subject = `[Approval Required] Creative Brief: ${fields.Title}`;
      let sent = 0;
      await Promise.all(approvers.map(async ({ email, displayName }) => {
        const name = displayName || email;
        const tokens = {
          approve: signToken({ tid: String(item.id), action: "approve", email, name, kind: "cdw" }),
          deny: signToken({ tid: String(item.id), action: "deny", email, name, kind: "cdw" }),
          changes: signToken({ tid: String(item.id), action: "changes", email, name, kind: "cdw" }),
        };
        const html = cdwApprovalRequestEmail(fields, who, tokens);
        try { await sendMail(client, email, subject, html); sent++; }
        catch (e) { context.error(`CDW approval email to ${email} failed:`, e.message); }
      }));

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent } };
    } catch (error) {
      context.error("sendCdwApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
