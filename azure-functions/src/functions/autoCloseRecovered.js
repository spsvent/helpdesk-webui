const { app } = require("@azure/functions");
const { config, getGraphClient } = require("../lib/graphHelpers");
const { autoCloseDecision } = require("../lib/kumaRecovery");

// Hourly sweep that closes Uptime Kuma tickets whose monitor came back and stayed
// back. CreateTicket stamps ExternalRecoveredAt when Kuma reports UP (and clears it
// on a fresh DOWN); this sweep closes any still-untouched "New" ticket whose stamp
// has held for KUMA_AUTO_CLOSE_MINUTES. Nobody is emailed — a monitor that fixed
// itself while no one was looking shouldn't generate a second round of noise; the
// closing comment and the ActivityLog entry are the record.
//
// Conservative by construction: tickets a person has picked up (status moved off
// "New") or replied to are left alone, and every skip is logged with its reason.

const ACTIVITY_LOG_LIST_ID = process.env.ACTIVITY_LOG_LIST_ID;
// How long the monitor must stay UP before the ticket closes. 0 disables the sweep.
const AUTO_CLOSE_MINUTES = Number(process.env.KUMA_AUTO_CLOSE_MINUTES ?? 60);
// Guards a runaway sweep — far above any plausible number of open "New" tickets.
const MAX_TICKETS = 500;

// Pacific is where the park is; an ISO timestamp in a ticket comment reads as noise
// to the people who actually open these. Falls back to the raw ISO if ICU is absent.
function formatPacific(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// Only "New" tickets can qualify, so filter server-side on status and screen the
// rest (kuma ref, recovery stamp) in memory — ExternalRecoveredAt isn't indexed and
// SharePoint's `ne null` support on datetime columns is unreliable through Graph.
async function fetchNewTickets(client) {
  const res = await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items`)
    .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
    .filter("fields/Status eq 'New'")
    .expand("fields($select=Status,ExternalRef,ExternalRecoveredAt,Title)")
    .top(MAX_TICKETS)
    .get();
  return res.value || [];
}

async function fetchComments(client, ticketId) {
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketID eq ${Number(ticketId)}`)
      .get();
    return res.value || [];
  } catch (e) {
    console.error(`fetchComments(${ticketId}) failed:`, e.message);
    // Unknown comment history — assume someone is engaged rather than close over them.
    return null;
  }
}

async function addComment(client, ticketId, body) {
  await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
    fields: {
      Title: body.substring(0, 50),
      TicketID: Number(ticketId),
      Body: body,
      IsInternal: false,
      OriginalAuthor: "API",
    },
  });
}

async function logActivity(client, entry) {
  if (!ACTIVITY_LOG_LIST_ID) return;
  try {
    const fields = { Title: entry.description, EventType: entry.eventType, Actor: "uptime-kuma" };
    if (entry.ticketId) fields.TicketId = String(entry.ticketId);
    if (entry.details) fields.Details = entry.details;
    await client.api(`/sites/${config.siteId}/lists/${ACTIVITY_LOG_LIST_ID}/items`).post({ fields });
  } catch (e) {
    console.error("logActivity failed:", e.message);
  }
}

async function closeTicket(client, item, recoveredAtIso, context) {
  const id = item.id;
  await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${id}/fields`)
    .patch({ Status: "Closed", ExternalRecoveredAt: null });

  const held = Math.round(AUTO_CLOSE_MINUTES);
  await addComment(
    client,
    id,
    `Auto-closed: Uptime Kuma reported this monitor back UP at ${formatPacific(recoveredAtIso)} ` +
      `and it stayed up for ${held} minutes with no further alerts. ` +
      `Reopen this ticket if the underlying problem is still unresolved.`,
  ).catch((e) => context.error(`auto-close comment on ticket ${id} failed:`, e.message));

  await logActivity(client, {
    description: "Ticket auto-closed after monitor recovery",
    eventType: "StatusChanged",
    ticketId: id,
    details: JSON.stringify({
      externalRef: item.fields?.ExternalRef || null,
      recoveredAt: recoveredAtIso,
      holdMinutes: AUTO_CLOSE_MINUTES,
      from: "New",
      to: "Closed",
    }),
  });
}

async function runSweep(context) {
  if (!(AUTO_CLOSE_MINUTES > 0)) {
    context.log("autoCloseRecovered: disabled (KUMA_AUTO_CLOSE_MINUTES <= 0)");
    return { ok: true, disabled: true, closed: 0 };
  }
  if (!config.siteId || !config.ticketsListId || !config.commentsListId) {
    context.error("autoCloseRecovered: SharePoint site/list ids not configured");
    return { ok: false, error: "server not configured" };
  }

  const client = await getGraphClient();
  const items = await fetchNewTickets(client);
  if (items.length === MAX_TICKETS) {
    context.warn(`autoCloseRecovered: hit the ${MAX_TICKETS}-ticket page cap — some tickets were not examined`);
  }

  const now = Date.now();
  const closed = [];
  const skipped = {};
  for (const item of items) {
    // Cheap checks first so we only pull comments for genuine candidates.
    const pre = autoCloseDecision(item, [], now, AUTO_CLOSE_MINUTES);
    if (!pre.close) {
      skipped[pre.reason] = (skipped[pre.reason] || 0) + 1;
      continue;
    }
    const comments = await fetchComments(client, item.id);
    if (comments === null) {
      skipped["comments-unavailable"] = (skipped["comments-unavailable"] || 0) + 1;
      continue;
    }
    const decision = autoCloseDecision(item, comments, now, AUTO_CLOSE_MINUTES);
    if (!decision.close) {
      skipped[decision.reason] = (skipped[decision.reason] || 0) + 1;
      continue;
    }
    try {
      await closeTicket(client, item, item.fields.ExternalRecoveredAt, context);
      closed.push(item.id);
    } catch (e) {
      context.error(`auto-close of ticket ${item.id} failed:`, e.message);
      skipped["close-failed"] = (skipped["close-failed"] || 0) + 1;
    }
  }

  context.log(`autoCloseRecovered: examined ${items.length}, closed ${closed.length}`, JSON.stringify(skipped));
  return { ok: true, examined: items.length, closed: closed.length, closedIds: closed, skipped };
}

app.timer("autoCloseRecovered", {
  schedule: "0 0 * * * *", // Every hour at minute 0
  handler: async (_timer, context) => {
    try {
      await runSweep(context);
    } catch (e) {
      context.error("autoCloseRecovered sweep failed:", e.message);
    }
  },
});

// Manual trigger, mirroring runEscalationCheck / runPurchaseReminders — lets you
// exercise the sweep without waiting for the hour to turn.
app.http("runAutoCloseRecovered", {
  methods: ["POST", "GET"],
  authLevel: "function",
  handler: async (_request, context) => {
    try {
      return { status: 200, jsonBody: await runSweep(context) };
    } catch (e) {
      context.error("autoCloseRecovered sweep failed:", e.message);
      return { status: 500, jsonBody: { ok: false, error: e.message } };
    }
  },
});
