const { app } = require("@azure/functions");
const { config, getGraphClient, sendMail } = require("../lib/graphHelpers");
const { resolveDecisionRecipients } = require("../lib/approvalRecipients");
const { commentEmail } = require("../lib/emailTemplates");
const { parseTicketId, isAutoReply, htmlToText } = require("../lib/inboundParsing");

const SENDER = config.senderEmail;

async function markRead(client, id) {
  try {
    await client.api(`/users/${SENDER}/messages/${id}`).patch({ isRead: true });
  } catch (e) {
    console.error(`markRead ${id} failed:`, e.message);
  }
}

async function isDirectoryUser(client, email) {
  try {
    await client.api(`/users/${encodeURIComponent(email)}`).select("id").get();
    return true;
  } catch {
    return false;
  }
}

async function getTicketFields(client, tid) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${tid}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  fields.RequesterEmail = item.createdBy?.user?.email || "";
  return fields;
}

async function getCommenterEmails(client, tid) {
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketID eq ${tid}`)
      .get();
    return (res.value || [])
      .filter((i) => i.fields?.IsInternal !== true)
      .map((i) => i.createdBy?.user?.email)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function addPublicComment(client, tid, body, authorLabel, sentDateTime) {
  await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
    fields: {
      Title: body.substring(0, 50) + (body.length > 50 ? "..." : ""),
      TicketID: Number(tid),
      Body: body,
      IsInternal: false,
      OriginalAuthor: authorLabel,
      OriginalCreated: sentDateTime,
    },
  });
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
    console.error("logActivity failed:", e.message);
  }
}

// Returns a short status string describing what happened to the message.
async function processMessage(client, msg) {
  const fromEmail = (msg.from?.emailAddress?.address || "").trim();
  const fromName = msg.from?.emailAddress?.name || fromEmail;

  // 1. Auto-reply / self-sent guard (prevents notification loops)
  if (isAutoReply(msg) || (fromEmail && fromEmail.toLowerCase() === SENDER.toLowerCase())) {
    await markRead(client, msg.id);
    return "skipped_auto";
  }

  // 2. Ticket id from subject (no match -> leave unread for human triage)
  const tid = parseTicketId(msg.subject);
  if (!tid) return "skipped_no_ticket";

  // 3. Directory sender (unknown -> leave unread for human triage)
  if (!fromEmail || !(await isDirectoryUser(client, fromEmail))) return "skipped_unknown_sender";

  // 4. Ticket must exist (stale ref -> mark read, nothing to do)
  let fields;
  try {
    fields = await getTicketFields(client, tid);
  } catch {
    await markRead(client, msg.id);
    return "skipped_stale_ticket";
  }

  // 5. Reply body via Graph uniqueBody (text) — Exchange already removed quoted history
  let raw = "";
  try {
    const full = await client
      .api(`/users/${SENDER}/messages/${msg.id}`)
      .header("Prefer", 'outlook.body-content-type="text"')
      .select("uniqueBody")
      .get();
    raw = full.uniqueBody?.content || "";
  } catch (e) {
    console.error(`uniqueBody fetch ${msg.id} failed:`, e.message);
  }
  const body = htmlToText(raw);
  if (!body) return "skipped_empty"; // leave unread

  // 6. Create the public comment, attributed to the sender
  const authorLabel = fromName && fromName !== fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;
  const finalBody = `— replied via email\n\n${body}`;
  await addPublicComment(client, tid, finalBody, authorLabel, msg.sentDateTime);

  // 7. Activity log
  await logActivity(client, {
    eventType: "comment_added",
    ticketId: tid,
    ticketNumber: fields.TicketNumber,
    actor: fromEmail,
    actorName: fromName,
    description: `Comment added by ${fromName} (via email)`,
    details: JSON.stringify({ channel: "email", preview: body.substring(0, 100) }),
  });

  // 8. Re-notify participants (closes the email thread), excluding the sender
  const commenterEmails = await getCommenterEmails(client, tid);
  const recipients = resolveDecisionRecipients(fields, commenterEmails, fromEmail);
  const ref = `Ticket #${fields.TicketNumber || tid}`;
  const subject = `[New Comment] ${ref}: ${fields.Title}`;
  const html = commentEmail(fields, ref, fromName, body);
  await Promise.all(
    recipients.map((to) =>
      sendMail(client, to, subject, html).catch((e) => console.error(`comment email to ${to} failed:`, e.message))
    )
  );

  // 9. Mark processed
  await markRead(client, msg.id);
  return "comment_created";
}

async function runPoll(context) {
  if (process.env.INBOUND_POLL_DISABLED === "true") {
    context.log("inbound poll disabled via INBOUND_POLL_DISABLED");
    return { disabled: true };
  }

  const client = await getGraphClient();
  let messages;
  try {
    const res = await client
      .api(`/users/${SENDER}/mailFolders/inbox/messages`)
      .filter("isRead eq false")
      .top(25)
      .select("id,subject,from,sentDateTime,internetMessageHeaders")
      .get();
    messages = res.value || [];
  } catch (e) {
    context.error("inbound inbox read failed (is Mail.ReadWrite granted + admin-consented?):", e.message);
    return { error: e.message };
  }

  const counts = {};
  for (const msg of messages) {
    try {
      const r = await processMessage(client, msg);
      counts[r] = (counts[r] || 0) + 1;
    } catch (e) {
      // Leave the message unread so it retries next cycle.
      context.error(`processMessage ${msg.id} failed (left unread):`, e.message);
      counts.error = (counts.error || 0) + 1;
    }
  }
  context.log("inbound poll done:", JSON.stringify(counts));
  return { processed: messages.length, ...counts };
}

// Timer: every 2 minutes
app.timer("pollInboundReplies", {
  schedule: "0 */2 * * * *",
  handler: async (myTimer, context) => {
    await runPoll(context);
  },
});

// Manual trigger for testing (function-key protected)
app.http("runInboundPoll", {
  methods: ["POST", "GET"],
  authLevel: "function",
  handler: async (request, context) => {
    const result = await runPoll(context);
    return { status: 200, jsonBody: { ok: true, ...result } };
  },
});
