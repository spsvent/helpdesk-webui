const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { approvalRequestEmail } = require("../lib/emailTemplates");
const { isValidItemId } = require("../lib/requestGuards");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// authLevel "function": only the SPA (whose NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL
// carries ?code=<function-key>, same as the SendEmail/Teams/Escalation URLs) can
// trigger approver emails — an anonymous caller could otherwise loop this into an
// approval-fatigue email bomb with valid one-click tokens.
app.http("sendApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "function",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { ticketId, requesterName } = await request.json().catch(() => ({}));
    // Strict numeric id — it's interpolated into the Graph path below.
    if (!isValidItemId(ticketId)) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "invalid_ticketId" } };
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

      // SECURITY GATE: only mint + send tokens when the ticket is genuinely Pending
      // approval — blocks minting for non-pending or already-decided tickets. The
      // endpoint additionally requires a function key (see authLevel above), so
      // "not_pending" is only ever observable by the SPA itself.
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
      // Log the detail server-side only — error.message can leak Graph/config internals.
      context.error("sendApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error" } };
    }
  },
});
