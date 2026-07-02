const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { cdwApprovalRequestEmail } = require("../lib/cdwEmailTemplates");
const { isValidItemId, isWithinCooldown } = require("../lib/requestGuards");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Mirror of sendApprovalRequest.js, but for CDW creative briefs: mints signed
// one-click tokens (tagged kind:'cdw') and emails the GM group.
//
// authLevel "function": only the SPA (whose NEXT_PUBLIC_SEND_CDW_APPROVAL_REQUEST_URL
// carries ?code=<function-key>, same as the SendEmail/Teams/Escalation URLs) can
// trigger approver emails — an anonymous caller could otherwise loop this into an
// approval-fatigue email bomb with valid one-click tokens.
app.http("sendCdwApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "function",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { cdwId, requesterName } = await request.json().catch(() => ({}));
    // Strict numeric id — it's interpolated into the Graph path below.
    if (!isValidItemId(cdwId)) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "invalid_cdwId" } };
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

      // SECURITY GATE: only mint/send tokens for a brief that is genuinely Pending
      // Approval (mirrors the ticket flow's gate). The distinct "not_pending" note is
      // fine to keep now that the endpoint requires a function key — the only caller
      // is the SPA, which needs the real signal.
      if (fields.CdwStatus !== "Pending Approval") {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "not_pending" } };
      }

      // RE-SEND COOLDOWN: refuse to email the GM group again if a request for this
      // brief already went out in the last 10 minutes. The stamp is server-written
      // below; briefs on lists created before the column existed simply have no
      // stamp, so the cooldown just doesn't apply there.
      if (isWithinCooldown(fields.ApprovalRequestSentAt)) {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "cooldown" } };
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

      if (sent > 0) {
        try {
          await client
            .api(`/sites/${config.siteId}/lists/${config.cdwListId}/items/${item.id}/fields`)
            .patch({ ApprovalRequestSentAt: new Date().toISOString() });
        } catch (e) {
          // Lists created before the column existed can't hold the stamp — log and
          // proceed without a cooldown rather than failing the (already sent) request.
          context.warn(`could not stamp ApprovalRequestSentAt on CDW ${item.id}:`, e.message);
        }
      }

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent } };
    } catch (error) {
      // Log the detail server-side only — error.message can leak Graph/config internals.
      context.error("sendCdwApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error" } };
    }
  },
});
