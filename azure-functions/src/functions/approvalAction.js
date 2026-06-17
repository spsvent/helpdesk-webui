const { app } = require("@azure/functions");
const { verifyToken } = require("../lib/approvalToken");
const { actionToDecision, buildDecisionFields, isTerminalStatus } = require("../lib/decisionFields");
const { resolveDecisionRecipients } = require("../lib/approvalRecipients");
const { config, getGraphClient, sendMail, getGroupMemberEmails } = require("../lib/graphHelpers");
const { decisionEmail, purchaseApprovedEmail } = require("../lib/emailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getTicketFields(client, ticketId) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticketId}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  // Requester email comes from the item creator (mirrors mapToTicket).
  fields.RequesterEmail = item.createdBy?.user?.email || "";
  // Capture the item ETag for optimistic-concurrency on the decision write.
  fields.__etag = item["@odata.etag"] || "*";
  return fields;
}

async function getCommenterEmails(client, ticketId) {
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketID eq ${ticketId}`)
      .get();
    // Only PUBLIC commenters are participants (per spec). Exclude internal-note
    // authors so internal-only staff aren't auto-added to the decision-email set
    // (matches the frontend `comments.filter((c) => !c.isInternal)`).
    return (res.value || [])
      .filter((i) => i.fields?.IsInternal !== true)
      .map((i) => i.createdBy?.user?.email)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function addInternalComment(client, ticketId, body) {
  await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
    fields: {
      Title: body.substring(0, 50) + (body.length > 50 ? "..." : ""),
      TicketID: Number(ticketId),
      Body: body,
      IsInternal: true,
    },
  });
}

async function logActivity(client, entry) {
  if (!config.activityLogListId) return;
  try {
    // Mirror the EXACT field schema written by src/lib/graphClient.ts logActivity:
    // Title (= description), EventType, Actor, and optional TicketId / TicketNumber /
    // ActorName / Details. The ActivityLog list has NO "Description" column.
    const fields = {
      Title: entry.description,
      EventType: entry.eventType,
      Actor: entry.actor || "",
    };
    if (entry.ticketId) fields.TicketId = String(entry.ticketId);
    if (entry.ticketNumber) fields.TicketNumber = String(entry.ticketNumber);
    if (entry.actorName) fields.ActorName = entry.actorName;
    if (entry.details) fields.Details = entry.details;
    await client.api(`/sites/${config.siteId}/lists/${config.activityLogListId}/items`).post({ fields });
  } catch (e) {
    console.error("logActivity failed:", e.message);
  }
}

function ticketRefOf(fields) {
  return `Ticket #${fields.TicketNumber || fields.id}`;
}

app.http("approvalAction", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    // Token comes from query (GET) or body (POST)
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
    const { tid, action, email: approverEmail, name: approverName } = result.payload;
    const decision = actionToDecision(action);
    if (!decision) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "bad_action" } };
    }

    try {
      const client = await getGraphClient();
      const fields = await getTicketFields(client, tid);
      const isPurchase = !!fields.IsPurchaseRequest;

      // ---- GET: side-effect-free summary (safe for mail-scanner prefetch) ----
      if (request.method === "GET") {
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: {
            ok: true,
            action,
            decision,
            approverName,
            ticket: {
              ref: ticketRefOf(fields),
              title: fields.Title,
              category: fields.Category,
              priority: fields.Priority,
              isPurchaseRequest: isPurchase,
              purchaseJustification: fields.PurchaseJustification || null,
              currentApprovalStatus: fields.ApprovalStatus || "Pending",
              decidedBy: fields.ApprovedByName || null,
              decidedDate: fields.ApprovalDate || null,
            },
            alreadyDecided: isTerminalStatus(fields.ApprovalStatus),
          },
        };
      }

      // ---- POST: execute ----
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
      const patch = buildDecisionFields(decision, approverName, approverEmail, note || undefined, isPurchase, nowIso);

      // Optimistic concurrency: condition the write on the ETag we just read so two
      // near-simultaneous clicks can't both pass the terminal-status check above and
      // both write (the TOCTOU race). PATCH the item endpoint (not /fields) because
      // If-Match applies at the item level; this mirrors processApprovalDecision's
      // `client.api(itemEndpoint).patch({ fields })` shape.
      //
      // On 412 (lost the race): if a TERMINAL decision won, report already_decided.
      // If a NON-terminal change won (e.g. someone clicked "Request Changes" — those
      // links stay live), re-read the fresh ETag and retry ONCE, since this Approve/
      // Deny is still valid. Persistent contention returns a clean retryable conflict,
      // never a 500.
      let etag = fields.__etag;
      for (let attempt = 0; ; attempt++) {
        try {
          await client
            .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${tid}`)
            .header("If-Match", etag)
            .patch({ fields: patch });
          break;
        } catch (e) {
          if (e.statusCode !== 412) throw e;
          const fresh = await getTicketFields(client, tid);
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
          etag = fresh.__etag; // retry once against the fresh, non-terminal ETag
        }
      }

      // Verify the status saved (mirror of the in-app verify step)
      const verify = await getTicketFields(client, tid);
      if (verify.ApprovalStatus !== decision) {
        throw new Error(`Approval status failed to save (got "${verify.ApprovalStatus}")`);
      }

      // Internal decision comment (mirrors TicketDetail handleApprovalDecision)
      const noteText = note ? `📋 **${decision}** by ${approverName}\n\nNotes: ${note}` : `📋 **${decision}** by ${approverName}`;
      await addInternalComment(client, tid, noteText);

      await logActivity(client, {
        eventType: decision === "Approved" ? "approval_approved" : "approval_rejected",
        ticketId: tid,
        ticketNumber: verify.TicketNumber,
        actor: approverEmail,
        actorName: approverName,
        description: `Ticket ${decision.toLowerCase()} by ${approverName} (via email)`,
        details: JSON.stringify({ decision, notes: note || null, channel: "email" }),
      });

      // Decision emails -> participants (requester/assignee/approval-requester/participants/commenters, minus approver)
      const commenterEmails = await getCommenterEmails(client, tid);
      const recipients = resolveDecisionRecipients(verify, commenterEmails, approverEmail);
      const ref = ticketRefOf(verify);
      const subject = `[${decision}] ${ref}: ${verify.Title}`;
      const html = decisionEmail(verify, ref, decision, approverName, note || undefined);
      await Promise.all(recipients.map((to) =>
        sendMail(client, to, subject, html).catch((e) => console.error(`decision email to ${to} failed:`, e.message))
      ));

      // Purchase approval -> notify purchaser group (parity with in-app flow)
      if (isPurchase && decision === "Approved") {
        const purchasers = await getGroupMemberEmails(client, config.purchaserGroupId);
        const pSubject = `[Purchase Approved] ${ref}: ${verify.Title}`;
        const pHtml = purchaseApprovedEmail(verify, ref, approverName);
        await Promise.all(purchasers.map((to) =>
          sendMail(client, to, pSubject, pHtml).catch((e) => console.error(`purchaser email to ${to} failed:`, e.message))
        ));
      }

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, decision, ticketRef: ref } };
    } catch (error) {
      context.error("approvalAction failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
