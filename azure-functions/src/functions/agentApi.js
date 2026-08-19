const { app } = require("@azure/functions");
const crypto = require("crypto");
const { config, getGraphClient, sendMail } = require("../lib/graphHelpers");
const { resolveDecisionRecipients } = require("../lib/approvalRecipients");
const { commentEmail, statusChangeEmail } = require("../lib/emailTemplates");

// Agent-facing REST API: lets headless agents (MCP server / CLI on the ops VM)
// read a ticket, add comments, and change status — with the same activity
// logging and notification fan-out a human action produces. Unlike the other
// anonymous endpoints (which are narrow or token-gated), these are generic
// write endpoints, so they require the shared secret in the x-agent-key header
// (Function App setting AGENT_API_KEY; unset = whole API disabled).

const VALID_STATUSES = ["New", "In Progress", "On Hold", "Resolved", "Closed"];
const DEFAULT_ACTOR_LABEL = "Automation Agent";

function jsonResponse(status, body) {
  return { status, headers: { "Content-Type": "application/json" }, jsonBody: body };
}

// null when authorized, otherwise a ready-to-return error response.
function checkAgentKey(request) {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) return jsonResponse(503, { error: "agent_api_disabled", detail: "AGENT_API_KEY is not configured" });
  const provided = request.headers.get("x-agent-key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return jsonResponse(401, { error: "unauthorized" });
  }
  return null;
}

async function getTicketFields(client, tid) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${tid}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  fields.RequesterEmail = item.createdBy?.user?.email || fields.RequesterEmail || "";
  return fields;
}

async function getComments(client, tid) {
  const res = await client
    .api(`/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketID eq ${tid}`)
    .get();
  return (res.value || [])
    .map((i) => ({
      id: i.id,
      author: i.fields?.OriginalAuthor || i.createdBy?.user?.displayName || "",
      authorEmail: i.createdBy?.user?.email || "",
      body: i.fields?.Body || "",
      isInternal: i.fields?.IsInternal === true,
      created: i.fields?.OriginalCreated || i.createdDateTime,
    }))
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

async function logActivity(client, entry) {
  if (!config.activityLogListId) return;
  try {
    const fields = { Title: entry.description, EventType: entry.eventType, Actor: entry.actor || "" };
    if (entry.ticketId) fields.TicketId = String(entry.ticketId);
    if (entry.ticketNumber) fields.TicketNumber = String(entry.ticketNumber);
    if (entry.actorName) fields.ActorName = entry.actorName;
    if (entry.details) fields.Details = entry.details;
    await client.api(`/sites/${config.siteId}/lists/${config.activityLogListId}/items`).post({ fields });
  } catch (e) {
    console.error("agentApi logActivity failed:", e.message);
  }
}

async function notifyParticipants(client, fields, tid, subject, html, actorEmail) {
  const comments = await getComments(client, tid).catch(() => []);
  const commenterEmails = comments.filter((c) => !c.isInternal).map((c) => c.authorEmail).filter(Boolean);
  const recipients = resolveDecisionRecipients(fields, commenterEmails, actorEmail);
  await Promise.all(
    recipients.map((to) =>
      sendMail(client, to, subject, html, { actorEmail }).catch((e) =>
        console.error(`agentApi notify ${to} failed:`, e.message)
      )
    )
  );
  return recipients;
}

// GET /api/agent/tickets/{id} — full fields + comment thread
app.http("agentGetTicket", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "agent/tickets/{id:int}",
  handler: async (request, context) => {
    const denied = checkAgentKey(request);
    if (denied) return denied;
    const tid = request.params.id;
    try {
      const client = await getGraphClient();
      const fields = await getTicketFields(client, tid);
      const comments = await getComments(client, tid).catch(() => []);
      return jsonResponse(200, { ticket: fields, comments });
    } catch (e) {
      if (e.statusCode === 404) return jsonResponse(404, { error: "ticket_not_found", id: tid });
      context.error(`agentGetTicket ${tid} failed:`, e.message);
      return jsonResponse(500, { error: "internal_error", detail: e.message });
    }
  },
});

// GET /api/agent/tickets?status=In%20Progress&top=50 — summary list
app.http("agentListTickets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "agent/tickets",
  handler: async (request, context) => {
    const denied = checkAgentKey(request);
    if (denied) return denied;
    const status = request.query.get("status");
    const top = Math.min(Number(request.query.get("top")) || 50, 200);
    try {
      const client = await getGraphClient();
      const buildQuery = (withOrderby) => {
        let api = client
          .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items`)
          .expand("fields($select=Title,Status,Priority,ProblemType,TicketNumber,AssignedToName,Created,Modified)")
          .top(top)
          .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly");
        if (withOrderby) api = api.orderby("fields/Modified desc");
        if (status) api = api.filter(`fields/Status eq '${status.replace(/'/g, "''")}'`);
        return api;
      };
      let res;
      try {
        res = await buildQuery(true).get();
      } catch {
        // Non-indexed orderby can be rejected; refetch unordered and sort here.
        res = await buildQuery(false).get();
        res.value = (res.value || []).sort((a, b) =>
          String(b.fields?.Modified || "").localeCompare(String(a.fields?.Modified || ""))
        );
      }
      const tickets = (res.value || []).map((i) => ({
        id: i.id,
        ticketNumber: i.fields?.TicketNumber,
        title: i.fields?.Title,
        status: i.fields?.Status,
        priority: i.fields?.Priority,
        problemType: i.fields?.ProblemType,
        assignedTo: i.fields?.AssignedToName,
        created: i.fields?.Created,
        modified: i.fields?.Modified,
      }));
      return jsonResponse(200, { tickets });
    } catch (e) {
      context.error("agentListTickets failed:", e.message);
      return jsonResponse(500, { error: "internal_error", detail: e.message });
    }
  },
});

// POST /api/agent/tickets/{id}/comments
// body: { text, isInternal?, actorLabel?, actorEmail?, notify? }
// Public comments notify the requester + participants (same fan-out as an
// emailed reply); internal comments never notify. notify:false skips the
// emails for a public comment.
app.http("agentAddComment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "agent/tickets/{id:int}/comments",
  handler: async (request, context) => {
    const denied = checkAgentKey(request);
    if (denied) return denied;
    const tid = request.params.id;
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "invalid_json" });
    }
    const text = (body.text || "").trim();
    if (!text) return jsonResponse(400, { error: "missing_text" });
    const isInternal = body.isInternal === true;
    const actorLabel = (body.actorLabel || "").trim() || DEFAULT_ACTOR_LABEL;
    const actorEmail = (body.actorEmail || "").trim();
    const notify = body.notify !== false && !isInternal;

    try {
      const client = await getGraphClient();
      const fields = await getTicketFields(client, tid);

      await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
        fields: {
          Title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
          TicketID: Number(tid),
          Body: text,
          IsInternal: isInternal,
          OriginalAuthor: actorLabel,
        },
      });

      await logActivity(client, {
        eventType: "comment_added",
        ticketId: tid,
        ticketNumber: fields.TicketNumber,
        actor: actorEmail || actorLabel,
        actorName: actorLabel,
        description: `Comment added by ${actorLabel} (via agent API)`,
        details: JSON.stringify({ channel: "agent_api", isInternal, preview: text.substring(0, 100) }),
      });

      let notified = [];
      if (notify) {
        const ref = `Ticket #${fields.TicketNumber || tid}`;
        const subject = `[New Comment] ${ref}: ${fields.Title}`;
        const html = commentEmail(fields, ref, actorLabel, text);
        notified = await notifyParticipants(client, fields, tid, subject, html, actorEmail);
      }
      return jsonResponse(200, { ok: true, ticketId: tid, isInternal, notified });
    } catch (e) {
      if (e.statusCode === 404) return jsonResponse(404, { error: "ticket_not_found", id: tid });
      context.error(`agentAddComment ${tid} failed:`, e.message);
      return jsonResponse(500, { error: "internal_error", detail: e.message });
    }
  },
});

// POST /api/agent/tickets/{id}/status
// body: { status, actorLabel?, actorEmail?, note?, notify? }
// note (optional) is recorded as an internal comment alongside the change.
app.http("agentSetStatus", {
  methods: ["POST", "PATCH"],
  authLevel: "anonymous",
  route: "agent/tickets/{id:int}/status",
  handler: async (request, context) => {
    const denied = checkAgentKey(request);
    if (denied) return denied;
    const tid = request.params.id;
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "invalid_json" });
    }
    const status = (body.status || "").trim();
    if (!VALID_STATUSES.includes(status)) {
      return jsonResponse(400, { error: "invalid_status", valid: VALID_STATUSES });
    }
    const actorLabel = (body.actorLabel || "").trim() || DEFAULT_ACTOR_LABEL;
    const actorEmail = (body.actorEmail || "").trim();
    const notify = body.notify !== false;

    try {
      const client = await getGraphClient();
      const fields = await getTicketFields(client, tid);
      const oldStatus = fields.Status || "New";
      if (oldStatus === status) {
        return jsonResponse(200, { ok: true, ticketId: tid, status, unchanged: true });
      }

      await client
        .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${tid}/fields`)
        .patch({ Status: status });

      if (body.note && String(body.note).trim()) {
        const note = String(body.note).trim();
        await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
          fields: {
            Title: note.substring(0, 50) + (note.length > 50 ? "..." : ""),
            TicketID: Number(tid),
            Body: note,
            IsInternal: true,
            OriginalAuthor: actorLabel,
          },
        });
      }

      await logActivity(client, {
        eventType: "ticket_status_changed",
        ticketId: tid,
        ticketNumber: fields.TicketNumber,
        actor: actorEmail || actorLabel,
        actorName: actorLabel,
        description: `Status changed from ${oldStatus} to ${status} by ${actorLabel} (via agent API)`,
        details: JSON.stringify({ channel: "agent_api", oldStatus, newStatus: status }),
      });

      let notified = [];
      if (notify) {
        const ref = `Ticket #${fields.TicketNumber || tid}`;
        const subject = `[${status}] ${ref}: ${fields.Title}`;
        const html = statusChangeEmail(fields, ref, oldStatus, status, actorLabel);
        notified = await notifyParticipants(client, fields, tid, subject, html, actorEmail);
      }
      return jsonResponse(200, { ok: true, ticketId: tid, oldStatus, status, notified });
    } catch (e) {
      if (e.statusCode === 404) return jsonResponse(404, { error: "ticket_not_found", id: tid });
      context.error(`agentSetStatus ${tid} failed:`, e.message);
      return jsonResponse(500, { error: "internal_error", detail: e.message });
    }
  },
});
