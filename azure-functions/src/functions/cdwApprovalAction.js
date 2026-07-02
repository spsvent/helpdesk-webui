const { app } = require("@azure/functions");
const { verifyToken } = require("../lib/approvalToken");
const { actionToDecision, isTerminalStatus, decisionConflict } = require("../lib/decisionFields");
const { buildCdwDecisionFields, cdwDecisionRecipients } = require("../lib/cdwDecisionFields");
const { config, getGraphClient, sendMail } = require("../lib/graphHelpers");
const { cdwDecisionEmail } = require("../lib/cdwEmailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getCdwFields(client, id) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.cdwListId}/items/${id}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  // The CDW list has a RequesterEmail column, but it can be blank — fall back to the
  // item creator so decision emails to the requester aren't silently dropped (matches
  // the frontend mapToCdw fallback). OR-precedence preserves a populated column value.
  fields.RequesterEmail = fields.RequesterEmail || item.createdBy?.user?.email || "";
  fields.__etag = item["@odata.etag"] || "*";
  return fields;
}

app.http("cdwApprovalAction", {
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
    // This endpoint only handles CDW tokens — refuse ticket (or untagged) tokens so
    // a token minted for one entity can't act on another.
    if (result.payload.kind !== "cdw") {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "wrong_entity" } };
    }
    const { tid, action, email: approverEmail, name: approverName } = result.payload;
    const decision = actionToDecision(action);
    if (!decision) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "bad_action" } };
    }
    if (!config.cdwListId) {
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "cdw_list_not_configured" } };
    }

    try {
      const client = await getGraphClient();
      const fields = await getCdwFields(client, tid);

      // GET: side-effect-free summary (safe for mail-scanner prefetch).
      if (request.method === "GET") {
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: {
            ok: true,
            action,
            decision,
            approverName,
            brief: {
              title: fields.Title,
              deadline: fields.Deadline || null,
              projectManager: fields.ProjectManagerName || null,
              quickTake: fields.QuickTake || null,
              currentStatus: fields.CdwStatus || "Pending Approval",
              decidedBy: fields.ApprovedByName || null,
              decidedDate: fields.ApprovalDate || null,
            },
            alreadyDecided: isTerminalStatus(fields.CdwStatus),
          },
        };
      }

      // POST: execute the decision.
      if (action === "changes" && !note) {
        return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "note_required" } };
      }
      // Pending-only gate (mirror of sendCdwApprovalRequest's mint-side check):
      // decided briefs report already_decided; anything else non-pending (Draft,
      // Changes Requested — i.e. pulled back for revision) reports not_pending, so
      // a stale 14-day Approve link can't approve a half-revised brief.
      const conflict = decisionConflict(fields.CdwStatus, "Pending Approval", fields);
      if (conflict) {
        return { status: 409, headers: corsHeaders, jsonBody: { ok: false, ...conflict } };
      }

      const nowIso = new Date().toISOString();
      const patch = buildCdwDecisionFields(decision, approverName, approverEmail, note || undefined, nowIso);

      // Optimistic concurrency: condition the write on the ETag we just read so two
      // near-simultaneous clicks can't both pass the pending gate and both write.
      // On 412: re-run the gate on the fresh item — if a concurrent write decided or
      // un-pended the brief, report that; if it's still pending (an unrelated field
      // changed), retry once against the fresh ETag.
      let etag = fields.__etag;
      for (let attempt = 0; ; attempt++) {
        try {
          await client
            .api(`/sites/${config.siteId}/lists/${config.cdwListId}/items/${tid}`)
            .header("If-Match", etag)
            .patch({ fields: patch });
          break;
        } catch (e) {
          if (e.statusCode !== 412) throw e;
          const fresh = await getCdwFields(client, tid);
          const freshConflict = decisionConflict(fresh.CdwStatus, "Pending Approval", fresh);
          if (freshConflict) {
            return { status: 409, headers: corsHeaders, jsonBody: { ok: false, ...freshConflict } };
          }
          if (attempt >= 1) {
            return { status: 409, headers: corsHeaders, jsonBody: { ok: false, reason: "conflict_retry" } };
          }
          etag = fresh.__etag;
        }
      }

      // Verify the status saved.
      const verify = await getCdwFields(client, tid);
      if (verify.CdwStatus !== decision) {
        throw new Error(`CDW status failed to save (got "${verify.CdwStatus}")`);
      }

      // Notify recipients.
      const recipients = cdwDecisionRecipients(verify, decision, approverEmail);
      const subject = `[${decision}] Creative Brief: ${verify.Title}`;
      const html = cdwDecisionEmail(verify, decision, approverName, note || undefined);
      await Promise.all(recipients.map((to) =>
        sendMail(client, to, subject, html).catch((e) => context.error(`CDW decision email to ${to} failed:`, e.message))
      ));

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, decision, briefTitle: verify.Title } };
    } catch (error) {
      context.error("cdwApprovalAction failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
