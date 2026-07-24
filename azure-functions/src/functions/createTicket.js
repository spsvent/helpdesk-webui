const { app } = require("@azure/functions");
const { config, getGraphClient, sendMail } = require("../lib/graphHelpers");
const { escapeHtml } = require("../lib/emailTemplates");
const { validateCreateTicketInput, findOpenDuplicate } = require("../lib/ticketIntake");
const { parseAutoAssignRules, findAssignee } = require("../lib/autoAssign");
const { isKumaPayload, adaptKumaPayload } = require("../lib/kumaAdapter");

// Machine-to-machine ticket intake: lets another service (monitoring, an internal
// app) file a HelpDesk ticket over HTTP. Protected by the Azure Functions host key
// (authLevel:"function" → caller must pass ?code=<key>). Creates a full-fidelity
// ticket app-only: auto-assigns (same rules as the web form), emails the assignee,
// logs the activity, and dedupes flapping alerts via an optional externalRef.
// v1 handles "Problem" tickets only (Request tickets need the approval flow).

const AUTO_ASSIGN_LIST_ID = process.env.AUTO_ASSIGN_LIST_ID;
const ACTIVITY_LOG_LIST_ID = process.env.ACTIVITY_LOG_LIST_ID;

// Explicit caller override wins; otherwise route by the AutoAssign list. Any
// failure (list unset/unreadable) → unassigned rather than a hard error.
async function resolveAssignee(client, value) {
  if (value.assigneeEmail) return value.assigneeEmail;
  if (!AUTO_ASSIGN_LIST_ID) return null;
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${AUTO_ASSIGN_LIST_ID}/items`)
      .expand("fields")
      .top(500)
      .get();
    return findAssignee(parseAutoAssignRules(res.value || []), value);
  } catch (e) {
    console.error("resolveAssignee failed:", e.message);
    return null;
  }
}

// Resolve an email to its site-user id so the Requester person field populates.
// Mirrors getSiteUserId in the SPA (EMail then UserName, non-indexed queries).
async function findRequesterLookupId(client, email) {
  if (!email) return null;
  const esc = email.replace(/'/g, "''");
  for (const field of ["EMail", "UserName"]) {
    try {
      const res = await client
        .api(`/sites/${config.siteId}/lists/User Information List/items`)
        .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
        .filter(`fields/${field} eq '${esc}'`)
        .select("id")
        .top(1)
        .get();
      if (res.value && res.value.length > 0) return parseInt(res.value[0].id, 10);
    } catch (e) {
      console.error(`findRequesterLookupId (${field}) failed:`, e.message);
    }
  }
  return null;
}

// Fail OPEN (return null → create the ticket) if the lookup errors — better a rare
// duplicate than a dropped alert.
async function findDuplicate(client, externalRef) {
  if (!externalRef) return null;
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items`)
      .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
      .filter(`fields/ExternalRef eq '${externalRef.replace(/'/g, "''")}'`)
      .expand("fields($select=Status,ExternalRef,Title)")
      .get();
    return findOpenDuplicate(res.value || [], externalRef);
  } catch (e) {
    console.error("findDuplicate failed:", e.message);
    return null;
  }
}

async function addComment(client, ticketId, body) {
  try {
    await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
      fields: {
        Title: body.substring(0, 50),
        TicketID: Number(ticketId),
        Body: body,
        IsInternal: false,
        OriginalAuthor: "API",
      },
    });
  } catch (e) {
    console.error("addComment failed:", e.message);
  }
}

async function logActivity(client, entry) {
  if (!ACTIVITY_LOG_LIST_ID) return;
  try {
    const fields = { Title: entry.description, EventType: entry.eventType, Actor: entry.actor || "API" };
    if (entry.ticketId) fields.TicketId = String(entry.ticketId);
    if (entry.details) fields.Details = entry.details;
    await client.api(`/sites/${config.siteId}/lists/${ACTIVITY_LOG_LIST_ID}/items`).post({ fields });
  } catch (e) {
    console.error("logActivity failed:", e.message);
  }
}

function assignmentEmailHtml(value, ticketId, url) {
  const sub = value.problemTypeSub ? ` / ${escapeHtml(value.problemTypeSub)}` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
    <h2 style="margin:0 0 8px">New ticket assigned to you</h2>
    <p style="margin:0 0 4px"><strong>${escapeHtml(value.title)}</strong> &middot; Ticket #${ticketId}</p>
    <p style="white-space:pre-wrap;margin:8px 0">${escapeHtml(value.description)}</p>
    <ul style="margin:8px 0;padding-left:18px">
      <li>Type: ${escapeHtml(value.problemType)}${sub}</li>
      <li>Priority: ${escapeHtml(value.priority)}</li>
      ${value.location ? `<li>Location: ${escapeHtml(value.location)}</li>` : ""}
      ${value.source ? `<li>Filed by: ${escapeHtml(value.source)} (API)</li>` : ""}
    </ul>
    <p><a href="${url}">Open ticket &rarr;</a></p>
  </div>`;
}

app.http("CreateTicket", {
  methods: ["POST"],
  authLevel: "function",
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { ok: false, error: "invalid JSON body" } };
    }

    // Uptime Kuma posts its own { heartbeat, monitor, msg } shape. Adapt it, and
    // only create tickets for DOWN events — recovery/pending/maintenance are
    // acked with 200 and no ticket (the open ticket's externalRef dedupes repeats).
    if (isKumaPayload(body)) {
      const adapted = adaptKumaPayload(body);
      if (!adapted) {
        return { status: 200, jsonBody: { ok: true, skipped: true, reason: "uptime-kuma event is not DOWN" } };
      }
      body = adapted;
    }

    const { ok, errors, value } = validateCreateTicketInput(body);
    if (!ok) {
      return { status: 400, jsonBody: { ok: false, error: "validation failed", details: errors } };
    }

    if (!config.siteId || !config.ticketsListId) {
      context.error("createTicket: SHAREPOINT_SITE_ID / TICKETS_LIST_ID not configured");
      return { status: 500, jsonBody: { ok: false, error: "server not configured" } };
    }

    let client;
    try {
      client = await getGraphClient();
    } catch (e) {
      context.error("graph auth failed:", e.message);
      return { status: 502, jsonBody: { ok: false, error: "graph auth failed" } };
    }

    // Dedup: an OPEN ticket with the same externalRef gets a comment, not a twin.
    if (value.externalRef) {
      const dup = await findDuplicate(client, value.externalRef);
      if (dup) {
        const note = `Repeat alert${value.source ? ` from ${value.source}` : ""} (ref ${value.externalRef}):\n${value.description}`;
        await addComment(client, dup.id, note);
        await logActivity(client, {
          description: `Repeat API alert folded into existing ticket (ref ${value.externalRef})`,
          eventType: "Comment",
          actor: value.source || "API",
          ticketId: dup.id,
        });
        return {
          status: 200,
          jsonBody: { ok: true, deduped: true, id: dup.id, ticketNumber: Number(dup.id), url: `${config.appUrl}/?ticket=${dup.id}` },
        };
      }
    }

    const assignee = await resolveAssignee(client, value);
    const requesterLookupId = await findRequesterLookupId(client, value.requesterEmail);

    const fields = {
      Title: value.title,
      Description: value.description,
      Category: value.category,
      Priority: value.priority,
      ProblemType: value.problemType,
      Status: "New",
      SupportChannel: value.source ? `API: ${value.source}` : "API",
    };
    if (value.problemTypeSub) fields.ProblemTypeSub = value.problemTypeSub;
    if (value.problemTypeSub2) fields.ProblemTypeSub2 = value.problemTypeSub2;
    if (value.location) fields.Location = value.location;
    if (value.externalRef) fields.ExternalRef = value.externalRef;
    if (assignee) fields.OriginalAssignedTo = assignee;
    if (value.requesterEmail) fields.OriginalRequester = value.requesterEmail;
    if (requesterLookupId) fields.RequesterLookupId = requesterLookupId;

    let created;
    try {
      created = await client.api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items`).post({ fields });
    } catch (e) {
      context.error("ticket create failed:", e.message);
      return { status: 502, jsonBody: { ok: false, error: "ticket create failed" } };
    }

    const id = created.id;
    const url = `${config.appUrl}/?ticket=${id}`;

    // Best-effort notify + audit — never fail the create on these.
    if (assignee) {
      await sendMail(client, assignee, `[New Ticket #${id}] ${value.title}`, assignmentEmailHtml(value, id, url)).catch(
        (e) => context.error(`assignment email to ${assignee} failed:`, e.message),
      );
    }
    await logActivity(client, {
      description: `Ticket created via API${value.source ? ` (${value.source})` : ""}`,
      eventType: "Created",
      actor: value.source || "API",
      ticketId: id,
      details: JSON.stringify({ assignee: assignee || null, externalRef: value.externalRef || null }),
    });

    return {
      status: 201,
      jsonBody: { ok: true, deduped: false, id, ticketNumber: Number(id), assignedTo: assignee || null, url },
    };
  },
});
