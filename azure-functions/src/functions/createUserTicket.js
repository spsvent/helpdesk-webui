const { app } = require("@azure/functions");
const { config, getGraphClient, getGroupMembers } = require("../lib/graphHelpers");
const {
  validateWebTicketInput,
  buildWebTicketFields,
  parseClientPrincipal,
} = require("../lib/webTicketIntake");

// Web-form ticket intake. The SPA calls this instead of writing to the Tickets
// list with the signed-in user's delegated token.
//
// Why: SharePoint sees a delegated write from our app and a row added in the
// Lists app as the same operation by the same identity, so no permission could
// block the direct-list bypass that left ticket #607 unassigned and silent.
// Creating app-only here lets the Tickets list drop "Add Items" from everyone's
// permission level — the app keeps working, the Lists app stops being a way in.
//
// Auth is App Service Authentication (EasyAuth) in "allow unauthenticated"
// mode, so the existing anonymous endpoints keep working and this function
// enforces the principal itself. No principal → 401.
//
// Deliberately NOT merged into CreateTicket: that one is machine-to-machine
// (host key, Uptime Kuma payloads, externalRef dedup, Problem-only). Keeping
// them apart avoids risking the alerting path on a web-form change.

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": config.appUrl,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ms-client-principal",
  "Access-Control-Allow-Credentials": "true",
};

// Resolve an email to its site-user id so the Requester person field populates.
// Mirrors getSiteUserId in the SPA (EMail then UserName, non-indexed queries).
async function findSiteUserId(client, email) {
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
    } catch {
      // Try the next field; an unresolvable requester is not fatal.
    }
  }
  return null;
}

/**
 * Is this caller an admin? Resolved server-side ONLY — a client-supplied flag
 * would let anyone auto-approve their own Request ticket.
 * Errors resolve to false: failing closed leaves the request at Pending, which
 * is recoverable, whereas failing open would silently approve it.
 */
async function resolveIsAdmin(client, email) {
  const lower = (email || "").toLowerCase();
  if (!lower) return false;
  if (ADMIN_EMAILS.includes(lower)) return true;
  if (!config.generalManagersGroupId) return false;
  try {
    const members = await getGroupMembers(client, config.generalManagersGroupId);
    return (members || []).some((m) => (m.email || "").toLowerCase() === lower);
  } catch (e) {
    console.error("resolveIsAdmin failed, treating as non-admin:", e.message);
    return false;
  }
}

app.http("createUserTicket", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tickets",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const actor = parseClientPrincipal(request.headers.get("x-ms-client-principal"));
    if (!actor) {
      // Either EasyAuth is disabled or the caller is anonymous. Both are a
      // misconfiguration from the SPA's point of view, so say so plainly.
      context.warn("createUserTicket: no EasyAuth principal on request");
      return {
        status: 401,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "authentication required" },
      };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "invalid JSON body" },
      };
    }

    const { ok, errors, value } = validateWebTicketInput(body);
    if (!ok) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "validation failed", details: errors },
      };
    }

    if (!config.siteId || !config.ticketsListId) {
      context.error("createUserTicket: SHAREPOINT_SITE_ID / TICKETS_LIST_ID not configured");
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "server not configured" },
      };
    }

    let client;
    try {
      client = await getGraphClient();
    } catch (e) {
      context.error("graph auth failed:", e.message);
      return {
        status: 502,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "graph auth failed" },
      };
    }

    const isAdmin = await resolveIsAdmin(client, actor.email);
    const requesterSiteUserId = await findSiteUserId(client, actor.email);
    // Same person, so the approver lookup is the requester lookup.
    const adminSiteUserId = isAdmin ? requesterSiteUserId : null;

    const fields = buildWebTicketFields(
      value,
      actor,
      { requesterSiteUserId, adminSiteUserId },
      isAdmin,
      new Date().toISOString()
    );

    let created;
    try {
      created = await client
        .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items`)
        .post({ fields });
    } catch (e) {
      context.error("ticket create failed:", e.message);
      return {
        status: 502,
        headers: corsHeaders,
        jsonBody: { ok: false, error: "ticket create failed" },
      };
    }

    // POST to /items doesn't reliably return auto-generated columns (notably
    // TicketNumber), and the SPA's post-creation work — activity log, Teams,
    // assignment email — depends on it. Re-fetch before returning.
    let item;
    try {
      item = await client
        .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${created.id}?$expand=fields`)
        .get();
    } catch (e) {
      // The ticket exists; only the echo failed. Report success with what we
      // have rather than letting the SPA retry and create a duplicate.
      context.error("re-fetch after create failed:", e.message);
      return {
        status: 201,
        headers: corsHeaders,
        jsonBody: { ok: true, id: created.id, item: { id: created.id, fields } },
      };
    }

    context.log(
      `createUserTicket: #${created.id} by ${actor.email} (${value.category}/${value.problemType}, admin=${isAdmin})`
    );

    return { status: 201, headers: corsHeaders, jsonBody: { ok: true, id: created.id, item } };
  },
});
