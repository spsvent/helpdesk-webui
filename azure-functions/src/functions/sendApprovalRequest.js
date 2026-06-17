const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { approvalRequestEmail } = require("../lib/emailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.http("sendApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { ticketId, requesterName } = await request.json().catch(() => ({}));
    if (!ticketId) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "missing_ticketId" } };
    }

    try {
      const client = await getGraphClient();
      const item = await client
        .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticketId}?$expand=fields`)
        .get();
      const fields = item.fields || {};
      fields.id = item.id;
      const ref = `Ticket #${fields.TicketNumber || item.id}`;
      // Derive the requester name from SharePoint, not the (untrusted) browser param.
      const who = fields.ApprovalRequestedByName || requesterName || "A staff member";

      // SECURITY GATE: this endpoint is anonymous, so only mint + send tokens when the
      // ticket is genuinely Pending approval — blocks minting for non-pending or
      // already-decided tickets. (Residual, accepted: an anonymous caller could still
      // re-trigger approval emails for a *currently-pending* ticket ID until it leaves
      // Pending — far narrower than the original "any ticket" exposure. Chosen over
      // full bearer-token validation for simplicity.)
      if (fields.ApprovalStatus !== "Pending") {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "not_pending" } };
      }

      const approvers = await getGroupMembers(client, config.generalManagersGroupId);
      if (approvers.length === 0) {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "no approvers" } };
      }

      const subject = `[Approval Required] ${ref}: ${fields.Title}`;
      let sent = 0;
      await Promise.all(approvers.map(async ({ email, displayName }) => {
        const name = displayName || email; // attribute the decision to a real name when available
        const tokens = {
          approve: signToken({ tid: String(item.id), action: "approve", email, name }),
          deny: signToken({ tid: String(item.id), action: "deny", email, name }),
          changes: signToken({ tid: String(item.id), action: "changes", email, name }),
        };
        const html = approvalRequestEmail(fields, ref, who, tokens);
        try { await sendMail(client, email, subject, html); sent++; }
        catch (e) { context.error(`approval email to ${email} failed:`, e.message); }
      }));

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent } };
    } catch (error) {
      context.error("sendApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
