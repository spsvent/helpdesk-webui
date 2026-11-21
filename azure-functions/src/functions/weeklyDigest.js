const { app } = require("@azure/functions");
const { config, getGraphClient, sendMail } = require("../lib/graphHelpers");
const { weeklyDigestEmail } = require("../lib/weeklyDigestEmail");
const { parseRecipients, isDigestTime, buildTicketDigest, buildPurchaseDigest } = require("../lib/weeklyDigestLogic");

// Weekly personal digest — Tuesdays 10 AM Pacific.
//
// For each person in WEEKLY_DIGEST_RECIPIENTS, one email covering the last 7 days:
// their open tickets, the open tickets in queue addresses they watch, tickets in
// either group that were resolved/closed this week, and the purchase requests they
// are involved in that changed. All decisions live in weeklyDigestLogic.js.
//
// Read-only against SharePoint (no stamps, no status writes). Sends through
// graphHelpers.sendMail, so the NotificationOptOut list still applies.
//
// Config (Function App settings):
//   WEEKLY_DIGEST_RECIPIENTS  "person@x.com=queue@x.com;queue2@x.com,other@x.com"
//                             Unset/empty = no digests (timer is a no-op).

const WINDOW_DAYS = 7;
const PREFER_NON_INDEXED = "HonorNonIndexedQueriesWarningMayFailRandomly";

// Follow @odata.nextLink so a list over one page (Tickets is 600+) is read in full.
async function getAll(client, endpoint, { nonIndexed = false } = {}) {
  const out = [];
  let next = endpoint;
  while (next) {
    let req = client.api(next);
    if (nonIndexed) req = req.header("Prefer", PREFER_NON_INDEXED);
    const res = await req.get();
    out.push(...(res.value || []));
    next = res["@odata.nextLink"];
  }
  return out;
}

const withId = (item) => ({ ...(item.fields || {}), id: item.id });

async function fetchTickets(client) {
  const items = await getAll(client, `/sites/${config.siteId}/lists/${config.ticketsListId}/items?$expand=fields&$top=500`);
  return items.map(withId);
}

async function fetchActivitySince(client, sinceIso) {
  if (!config.activityLogListId) return [];
  const filter = encodeURIComponent(`fields/Created ge '${sinceIso}'`);
  const items = await getAll(
    client,
    `/sites/${config.siteId}/lists/${config.activityLogListId}/items?$expand=fields&$top=500&$filter=${filter}`,
    { nonIndexed: true }
  );
  return items.map(withId);
}

async function fetchCommentsSince(client, sinceIso) {
  if (!config.commentsListId) return [];
  const filter = encodeURIComponent(`fields/Created ge '${sinceIso}'`);
  const items = await getAll(
    client,
    `/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$top=500&$filter=${filter}`,
    { nonIndexed: true }
  );
  return items.map((i) => ({
    ...withId(i),
    AuthorName: i.createdBy?.user?.displayName || "",
    AuthorEmail: i.createdBy?.user?.email || "",
  }));
}

async function fetchPurchases(client) {
  if (!config.purchaseListId) return [];
  const items = await getAll(client, `/sites/${config.siteId}/lists/${config.purchaseListId}/items?$expand=fields&$top=500`);
  return items.map((i) => ({ ...withId(i), CreatedByEmail: i.createdBy?.user?.email || "" }));
}

// Site-user id → email, for just the addresses we care about. Older tickets only
// carry the AssignedTo person field (AssignedToLookupId), not the email text column.
async function siteUserIds(client, emails) {
  const map = {};
  for (const email of emails) {
    const esc = email.replace(/'/g, "''");
    for (const field of ["EMail", "UserName"]) {
      try {
        const res = await client
          .api(`/sites/${config.siteId}/lists/User Information List/items`)
          .header("Prefer", PREFER_NON_INDEXED)
          .filter(`fields/${field} eq '${esc}'`)
          .select("id")
          .top(1)
          .get();
        if (res.value && res.value.length > 0) {
          map[String(res.value[0].id)] = email;
          break;
        }
      } catch {
        // Unresolvable address: its lookup-only tickets just won't match.
      }
    }
  }
  return map;
}

// options: { dryRun, includeHtml, only } — `only` limits the run to one configured
// recipient (manual testing). Returns a per-recipient summary.
async function runWeeklyDigest(context, options = {}) {
  const recipients = parseRecipients(process.env.WEEKLY_DIGEST_RECIPIENTS).filter(
    (r) => !options.only || r.email === String(options.only).toLowerCase()
  );
  if (!recipients.length) {
    context.log("weeklyDigest: WEEKLY_DIGEST_RECIPIENTS not set (or no match), skipping.");
    return { skipped: true, recipients: [] };
  }
  if (!config.siteId || !config.ticketsListId) {
    context.log("weeklyDigest: SharePoint not configured, skipping.");
    return { skipped: true, recipients: [] };
  }

  const endMs = Date.now();
  const startMs = endMs - WINDOW_DAYS * 86400000;
  const sinceIso = new Date(startMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const client = await getGraphClient();

  const addresses = Array.from(new Set(recipients.flatMap((r) => [r.email, ...r.queues])));
  const [tickets, activity, comments, purchases, siteUserEmailById] = await Promise.all([
    fetchTickets(client),
    fetchActivitySince(client, sinceIso),
    fetchCommentsSince(client, sinceIso),
    fetchPurchases(client),
    siteUserIds(client, addresses),
  ]);
  context.log(
    `weeklyDigest: ${tickets.length} tickets, ${activity.length} activity rows, ${comments.length} comments, ${purchases.length} purchases since ${sinceIso}`
  );

  const results = [];
  for (const recipient of recipients) {
    const digest = {
      recipient,
      startMs,
      endMs,
      tickets: buildTicketDigest({ tickets, activity, comments, recipient, siteUserEmailById, startMs, endMs }),
      purchases: buildPurchaseDigest({ purchases, email: recipient.email, startMs, endMs }),
    };
    const { subject, html } = weeklyDigestEmail(digest, endMs);
    const summary = {
      email: recipient.email,
      subject,
      mine: digest.tickets.mine.length,
      queues: digest.tickets.queues.map((q) => ({ address: q.address, open: q.open.length })),
      closed: digest.tickets.closed.length,
      purchases: digest.purchases.length,
      sent: false,
    };
    if (options.includeHtml) summary.html = html;
    if (!options.dryRun) {
      try {
        await sendMail(client, recipient.email, subject, html);
        summary.sent = true;
      } catch (e) {
        context.error(`weeklyDigest: send to ${recipient.email} failed:`, e.message);
        summary.error = e.message;
      }
    }
    results.push(summary);
  }

  context.log("weeklyDigest: done", JSON.stringify(results.map(({ html, ...r }) => r)));
  return { skipped: false, dryRun: Boolean(options.dryRun), recipients: results };
}

// Tuesdays at 17:00 and 18:00 UTC; isDigestTime() keeps whichever one is 10 AM in
// Los Angeles (PDT = UTC-7, PST = UTC-8), so it lands at 10 AM local all year.
app.timer("weeklyDigest", {
  schedule: "0 0 17,18 * * 2",
  handler: async (myTimer, context) => {
    if (!isDigestTime(Date.now())) {
      context.log("weeklyDigest: not 10 AM Pacific on this firing, skipping.");
      return;
    }
    await runWeeklyDigest(context);
  },
});

// Manual run (host key required). Ignores the Tuesday-10-AM gate.
//   ?dryRun=1   build the digests, send nothing (add &html=1 to get the HTML back)
//   ?to=email   only this configured recipient
app.http("runWeeklyDigest", {
  methods: ["GET", "POST"],
  authLevel: "function",
  handler: async (request, context) => {
    const flag = (name) => ["1", "true", "yes"].includes(String(request.query.get(name) || "").toLowerCase());
    try {
      const result = await runWeeklyDigest(context, {
        dryRun: flag("dryRun"),
        includeHtml: flag("html"),
        only: request.query.get("to") || undefined,
      });
      return { status: 200, jsonBody: { success: true, ...result } };
    } catch (error) {
      context.error("weeklyDigest manual run failed:", error);
      return { status: 500, jsonBody: { success: false, error: error.message } };
    }
  },
});

module.exports = { runWeeklyDigest };
