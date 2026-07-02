const { app } = require("@azure/functions");
const { config, getGraphClient, sendMail, getGroupMemberEmails } = require("../lib/graphHelpers");
const { purchaseReminderEmail } = require("../lib/purchaseEmailTemplates");
const { reminderPlan, shouldSend } = require("../lib/purchaseReminderLogic");

// Daily purchase-reminder sweep. For every non-terminal PurchaseRequests item it
// asks reminderPlan() which nudges are due, throttles per-record via LastReminderSent,
// then emails the right audience:
//   approval → General Managers · order → Purchasers · receive → Inventory + requester
//
// Recipients come from the same Entra groups the approval flow uses (GENERAL_MANAGERS_/
// PURCHASER_/INVENTORY_GROUP_ID). If a group id is unset, that nudge simply no-ops.

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
  const [gmEmails, purchaserEmails, inventoryEmails] = await Promise.all([
    getGroupMemberEmails(client, config.generalManagersGroupId),
    getGroupMemberEmails(client, config.purchaserGroupId),
    getGroupMemberEmails(client, config.inventoryGroupId),
  ]);

  const items = await fetchPurchaseRequests(client);
  context.log(`purchaseReminders: evaluating ${items.length} purchase request(s).`);

  let sentEmails = 0;
  let remindedRecords = 0;

  for (const item of items) {
    const fields = item.fields || {};
    fields.id = item.id;
    if (TERMINAL.has(fields.PurchaseStatus)) continue;

    const lineItems = parseItems(fields);
    const req = {
      approvalStatus: fields.ApprovalStatus,
      purchaseStatus: fields.PurchaseStatus,
      needByDate: fields.NeedByDate,
      approvalRequestedDate: fields.ApprovalRequestedDate,
      lineItems,
      orderedAt: fields.PurchasedDate || item.lastModifiedDateTime,
    };

    const plan = reminderPlan(req, nowMs);
    if (plan.reminders.length === 0) continue;
    if (!shouldSend(fields.LastReminderSent, plan.cadenceDays, nowMs)) continue;

    const recipientsFor = {
      approval: gmEmails,
      order: purchaserEmails,
      receive: [...inventoryEmails, fields.RequesterEmail].filter(Boolean),
    };

    let sentForRecord = 0;
    for (const kind of plan.reminders) {
      const recipients = Array.from(new Set(recipientsFor[kind] || []));
      if (recipients.length === 0) continue;
      const html = purchaseReminderEmail(kind, fields, fields.NeedByDate);
      if (!html) continue;
      const subject = `[Reminder] Purchase Request: ${fields.Title}`;
      for (const to of recipients) {
        try {
          await sendMail(client, to, subject, html);
          sentEmails++;
          sentForRecord++;
        } catch (e) {
          context.error(`purchaseReminders: email (${kind}) to ${to} failed:`, e.message);
        }
      }
    }

    if (sentForRecord > 0) {
      await stampReminded(client, item.id, nowIso);
      remindedRecords++;
    }
  }

  const result = { checked: items.length, remindedRecords, sentEmails };
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
