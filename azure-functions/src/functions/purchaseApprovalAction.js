const { app } = require("@azure/functions");
const { verifyToken } = require("../lib/approvalToken");
const { actionToDecision, isTerminalStatus } = require("../lib/decisionFields");
const { buildPurchaseDecisionFields, purchaseDecisionRecipients } = require("../lib/purchaseDecisionFields");
const { config, getGraphClient, sendMail, getGroupMemberEmails } = require("../lib/graphHelpers");
const { purchaseDecisionEmail, purchaseApprovedForPurchaserEmail } = require("../lib/purchaseEmailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getPurchaseFields(client, id) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.purchaseListId}/items/${id}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  fields.RequesterEmail = fields.RequesterEmail || item.createdBy?.user?.email || "";
  fields.__etag = item["@odata.etag"] || "*";
  return fields;
}

app.http("purchaseApprovalAction", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    let token, note;
    if (request.method === "GET") {
      token = request.query.get("token");
    } else {
      const body = await request.json().catch(() => ({}));
      token = body.token;
      note = (body.note || "").trim();
    }

    const result = verifyToken(token);
    if (!result.valid) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: result.reason } };
    }
    if (result.payload.kind !== "purchase") {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "wrong_entity" } };
    }
    const { tid, action, email: approverEmail, name: approverName } = result.payload;
    const decision = actionToDecision(action);
    if (!decision) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "bad_action" } };
    }
    if (!config.purchaseListId) {
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "purchase_list_not_configured" } };
    }

    try {
      const client = await getGraphClient();
      const fields = await getPurchaseFields(client, tid);

      // GET: side-effect-free summary.
      if (request.method === "GET") {
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: {
            ok: true,
            action,
            decision,
            approverName,
            request: {
              title: fields.Title,
              justification: fields.PurchaseJustification || null,
              project: fields.PurchaseProject || null,
              currentStatus: fields.ApprovalStatus || "Pending",
              decidedBy: fields.ApprovedByName || null,
              decidedDate: fields.ApprovalDate || null,
            },
            alreadyDecided: isTerminalStatus(fields.ApprovalStatus),
          },
        };
      }

      // POST: execute.
      if (action === "changes" && !note) {
        return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "note_required" } };
      }
      if (isTerminalStatus(fields.ApprovalStatus)) {
        return {
          status: 409,
          headers: corsHeaders,
          jsonBody: { ok: false, reason: "already_decided", decidedBy: fields.ApprovedByName, decidedDate: fields.ApprovalDate },
        };
      }

      const nowIso = new Date().toISOString();
      const patch = buildPurchaseDecisionFields(decision, approverName, approverEmail, note || undefined, nowIso);

      let etag = fields.__etag;
      for (let attempt = 0; ; attempt++) {
        try {
          await client
            .api(`/sites/${config.siteId}/lists/${config.purchaseListId}/items/${tid}`)
            .header("If-Match", etag)
            .patch({ fields: patch });
          break;
        } catch (e) {
          if (e.statusCode !== 412) throw e;
          const fresh = await getPurchaseFields(client, tid);
          if (isTerminalStatus(fresh.ApprovalStatus)) {
            return {
              status: 409,
              headers: corsHeaders,
              jsonBody: { ok: false, reason: "already_decided", decidedBy: fresh.ApprovedByName, decidedDate: fresh.ApprovalDate },
            };
          }
          if (attempt >= 1) {
            return { status: 409, headers: corsHeaders, jsonBody: { ok: false, reason: "conflict_retry" } };
          }
          etag = fresh.__etag;
        }
      }

      const verify = await getPurchaseFields(client, tid);
      if (verify.ApprovalStatus !== decision) {
        throw new Error(`Approval status failed to save (got "${verify.ApprovalStatus}")`);
      }

      // Notify the requester of the decision.
      const recipients = purchaseDecisionRecipients(verify, approverEmail);
      const subject = `[${decision}] Purchase Request: ${verify.Title}`;
      const html = purchaseDecisionEmail(verify, decision, approverName, note || undefined);
      await Promise.all(recipients.map((to) =>
        sendMail(client, to, subject, html).catch((e) => context.error(`purchase decision email to ${to} failed:`, e.message))
      ));

      // On approval, notify the purchaser group it's ready to order (parity with the old flow).
      if (decision === "Approved") {
        const purchasers = await getGroupMemberEmails(client, config.purchaserGroupId);
        const pSubject = `[Purchase Approved] ${verify.Title}`;
        const pHtml = purchaseApprovedForPurchaserEmail(verify, approverName);
        await Promise.all(purchasers.map((to) =>
          sendMail(client, to, pSubject, pHtml).catch((e) => context.error(`purchaser email to ${to} failed:`, e.message))
        ));
      }

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, decision, title: verify.Title } };
    } catch (error) {
      context.error("purchaseApprovalAction failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
