const { app } = require("@azure/functions");
const { config, getGraphClient, sendMail, getGroupMemberEmails, getGroupMail } = require("../lib/graphHelpers");
const { purchaseReminderDigestEmail } = require("../lib/purchaseEmailTemplates");
const { reminderPlan, shouldSend } = require("../lib/purchaseReminderLogic");

// Daily purchase-reminder sweep. For every non-terminal PurchaseRequests item it
// asks reminderPlan() which nudges are due (throttled per-record via LastReminderSent),
// then sends ONE DIGEST email per audience summarizing everything due that day —
// not one email per request — so a busy morning is a single email, not a flood:
//   approval → General Managers · order → Purchasers · receive → Inventory + each requester
//
// Recipients come from the same Entra groups the approval flow uses (GENERAL_MANAGERS_/
// PURCHASER_/INVENTORY_GROUP_ID). If an audience is empty, that digest simply isn't sent
// (and its records aren't stamped, so they'll be picked up once the group is configured).
//
// The receive digest is delivered to the Inventory group's shared SMTP address (when the
// group is mail-enabled) rather than to each member individually — so a member can keep
// their membership/role but unsubscribe the digest in Outlook. It falls back to individual
// member emails if the group isn't mail-enabled.

const TERMINAL = new Set(["Received", "Denied"]);

function parseItems(fields) {
  try {
    const arr = JSON.parse(fields.PurchaseLineItemsJSON || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function fetchPurchaseRequests(client) {
  const endpoint = `/sites/${config.siteId}/lists/${config.purchaseListId}/items?$expand=fields&$top=500`;
  const res = await client.api(endpoint).get();
  return res.value || [];
}

async function stampReminded(client, id, nowIso) {
  try {
    await client
      .api(`/sites/${config.siteId}/lists/${config.purchaseListId}/items/${id}/fields`)
      .patch({ LastReminderSent: nowIso });
  } catch (e) {
    // A list created before the column existed can't hold the stamp — without it the
    // record would re-remind next run, so log rather than swallow silently.
    console.warn(`purchaseReminders: could not stamp LastReminderSent on ${id}:`, e.message);
  }
}

async function runPurchaseReminders(context) {
  if (!config.siteId || !config.purchaseListId) {
    context.log("purchaseReminders: SharePoint/purchase list not configured, skipping.");
    return { checked: 0, skipped: true };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const client = await getGraphClient();

  // Resolve each audience once per run (empty array if the group id isn't configured).
  // Inventory (receive) is delivered to the group's shared address so members can
  // subscribe/unsubscribe it in Outlook; fall back to member emails if the group isn't
  // mail-enabled, so a misconfigured group still nudges someone rather than no one.
  const [gmEmails, purchaserEmails, inventoryMail] = await Promise.all([
    getGroupMemberEmails(client, config.generalManagersGroupId),
    getGroupMemberEmails(client, config.purchaserGroupId),
    getGroupMail(client, config.inventoryGroupId),
  ]);
  const inventoryRecipients = inventoryMail
    ? [inventoryMail]
    : await getGroupMemberEmails(client, config.inventoryGroupId);

  const items = await fetchPurchaseRequests(client);
  context.log(`purchaseReminders: evaluating ${items.length} purchase request(s).`);

  // Pass 1 — bucket every due record by nudge kind. Each entry keeps the item id so
  // we can stamp it, and receive rows also key by requester for the per-person digest.
  const buckets = { approval: [], order: [], receive: [] };

  for (const item of items) {
    const fields = item.fields || {};
    fields.id = item.id;
    if (TERMINAL.has(fields.PurchaseStatus)) continue;

    const req = {
      approvalStatus: fields.ApprovalStatus,
      purchaseStatus: fields.PurchaseStatus,
      needByDate: fields.NeedByDate,
      approvalRequestedDate: fields.ApprovalRequestedDate,
      orderType: fields.OrderType,
      lineItems: parseItems(fields),
      orderedAt: fields.PurchasedDate || item.lastModifiedDateTime,
    };

    const plan = reminderPlan(req, nowMs);
    if (plan.reminders.length === 0) continue;
    if (!shouldSend(fields.LastReminderSent, plan.cadenceDays, nowMs)) continue;

    for (const kind of plan.reminders) buckets[kind].push({ id: item.id, fields });
  }

  // Pass 2 — send at most one digest per audience, and track which records made it
  // into a digest that was actually sent (so only those get stamped).
  const stampIds = new Set();
  let sentEmails = 0;

  async function sendDigest(kind, records, recipients) {
    const to = Array.from(new Set((recipients || []).filter(Boolean)));
    if (!records.length || to.length === 0) return;
    const html = purchaseReminderDigestEmail(kind, records.map((r) => r.fields));
    if (!html) return;
    const subject = `[Reminder] ${records.length} purchase request${records.length === 1 ? "" : "s"} need attention`;
    let anySent = false;
    for (const addr of to) {
      try {
        await sendMail(client, addr, subject, html);
        sentEmails++;
        anySent = true;
      } catch (e) {
        context.error(`purchaseReminders: ${kind} digest to ${addr} failed:`, e.message);
      }
    }
    if (anySent) records.forEach((r) => stampIds.add(r.id));
  }

  // Approval → GMs (one email); order → Purchasers (one email).
  await sendDigest("approval", buckets.approval, gmEmails);
  await sendDigest("order", buckets.order, purchaserEmails);

  // Receive → one digest to Inventory (everything), plus one digest per requester
  // (only their own items), so nobody gets a per-item flood.
  await sendDigest("receive", buckets.receive, inventoryRecipients);
  const byRequester = new Map();
  for (const rec of buckets.receive) {
    const email = rec.fields.RequesterEmail;
    if (!email) continue;
    if (!byRequester.has(email)) byRequester.set(email, []);
    byRequester.get(email).push(rec);
  }
  for (const [email, records] of byRequester) {
    await sendDigest("receive", records, [email]);
  }

  // Stamp each record that appeared in a sent digest.
  for (const id of stampIds) await stampReminded(client, id, nowIso);

  const result = { checked: items.length, remindedRecords: stampIds.size, sentEmails };
  context.log("purchaseReminders: done", result);
  return result;
}

// 9:00 AM Pacific. PST is UTC-8 / PDT is UTC-7; 16:00 UTC lands at 8–9 AM local
// year-round (the reminder time drifts an hour across DST — acceptable for a nudge).
app.timer("purchaseReminders", {
  schedule: "0 0 16 * * *",
  handler: async (myTimer, context) => {
    context.log("purchaseReminders timer fired at", new Date().toISOString());
    await runPurchaseReminders(context);
  },
});

// Manual trigger for testing / on-demand runs (host key required).
app.http("runPurchaseReminders", {
  methods: ["POST", "GET"],
  authLevel: "function",
  handler: async (request, context) => {
    try {
      const result = await runPurchaseReminders(context);
      return { status: 200, jsonBody: { success: true, ...result } };
    } catch (error) {
      context.error("purchaseReminders manual run failed:", error);
      return { status: 500, jsonBody: { success: false, error: error.message } };
    }
  },
});
