const { app } = require("@azure/functions");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
const crypto = require("crypto");

// Configuration from environment variables
const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  siteId: process.env.SHAREPOINT_SITE_ID,
  ticketsListId: process.env.TICKETS_LIST_ID,
  commentsListId: process.env.COMMENTS_LIST_ID,
  syncMapListId: process.env.VIKUNJA_SYNC_MAP_LIST_ID,
  webhookSecret: process.env.VIKUNJA_WEBHOOK_SECRET,
};

// MSAL singleton
let msalClient = null;
function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }
  return msalClient;
}

async function getAppToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return result.accessToken;
}

function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

// ============================================
// HMAC signature verification
// ============================================

function verifySignature(rawBody, signature) {
  if (!config.webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ============================================
// SyncMap helpers
// ============================================

async function getSyncMappingByVikunjaTaskId(graphClient, vikunjaTaskId) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items?$filter=fields/VikunjaTaskId eq ${vikunjaTaskId}&$expand=fields`;
  try {
    const response = await graphClient
      .api(endpoint)
      .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
      .get();
    return response.value.length > 0 ? response.value[0] : null;
  } catch {
    return null;
  }
}

async function updateSyncMapping(graphClient, itemId, data) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items/${itemId}`;
  return graphClient.api(endpoint).patch({
    fields: {
      LastSyncSource: "Vikunja",
      LastSyncTimestamp: new Date().toISOString(),
      LastEventHash: data.eventHash,
      SyncStatus: data.syncStatus || "Active",
      ...(data.lastError ? { LastError: data.lastError } : {}),
    },
  });
}

function computeEventHash(ticketId, eventType, keyData) {
  return crypto
    .createHash("sha256")
    .update(`${ticketId}:${eventType}:${JSON.stringify(keyData)}`)
    .digest("hex");
}

// ============================================
// Event handlers
// ============================================

async function handleTaskDone(graphClient, mapping, context) {
  const ticketId = mapping.fields.TicketId;
  const vikunjaTaskId = mapping.fields.VikunjaTaskId;

  // Dedup check
  const eventHash = computeEventHash(ticketId, "vikunja_task_done", { vikunjaTaskId });
  if (mapping.fields.LastEventHash === eventHash) {
    context.log(`Duplicate done event for ticket ${ticketId}, skipping`);
    return { action: "skipped", reason: "duplicate" };
  }

  // Time window check — skip if HelpDesk synced within 5 seconds
  if (mapping.fields.LastSyncSource === "HelpDesk") {
    const lastSync = new Date(mapping.fields.LastSyncTimestamp).getTime();
    if (Date.now() - lastSync < 5000) {
      context.log(`Recent HelpDesk sync for ticket ${ticketId}, skipping to prevent loop`);
      return { action: "skipped", reason: "recent_helpdesk_sync" };
    }
  }

  // Update ticket status to Resolved in SharePoint
  const ticketEndpoint = `/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticketId}`;
  await graphClient.api(ticketEndpoint).patch({
    fields: {
      Status: "Resolved",
    },
  });

  // Add system comment to ticket
  const commentEndpoint = `/sites/${config.siteId}/lists/${config.commentsListId}/items`;
  await graphClient.api(commentEndpoint).post({
    fields: {
      Title: `Ticket ${mapping.fields.Title}`,
      TicketID: parseInt(ticketId),
      Body: "[Synced from Vikunja] Task marked as complete in Vikunja — ticket resolved automatically.",
      IsInternal: false,
      CommentType: "Status Change",
    },
  });

  await updateSyncMapping(graphClient, mapping.id, { eventHash });
  context.log(`Resolved ticket ${ticketId} from Vikunja task done event`);
  return { action: "resolved", ticketId };
}

async function handleCommentCreated(graphClient, mapping, commentText, context) {
  const ticketId = mapping.fields.TicketId;

  // Loop prevention — skip comments that originated from Help Desk
  if (commentText.includes("[Synced from Help Desk]")) {
    context.log(`Skipping comment synced from Help Desk for ticket ${ticketId}`);
    return { action: "skipped", reason: "originated_from_helpdesk" };
  }

  // Dedup check
  const eventHash = computeEventHash(ticketId, "vikunja_comment", {
    text: commentText.substring(0, 100),
  });
  if (mapping.fields.LastEventHash === eventHash) {
    context.log(`Duplicate comment event for ticket ${ticketId}, skipping`);
    return { action: "skipped", reason: "duplicate" };
  }

  // Time window check
  if (mapping.fields.LastSyncSource === "HelpDesk") {
    const lastSync = new Date(mapping.fields.LastSyncTimestamp).getTime();
    if (Date.now() - lastSync < 5000) {
      context.log(`Recent HelpDesk sync for ticket ${ticketId}, skipping to prevent loop`);
      return { action: "skipped", reason: "recent_helpdesk_sync" };
    }
  }

  // Add comment to SharePoint TicketComments list
  const commentEndpoint = `/sites/${config.siteId}/lists/${config.commentsListId}/items`;
  await graphClient.api(commentEndpoint).post({
    fields: {
      Title: `Ticket ${mapping.fields.Title}`,
      TicketID: parseInt(ticketId),
      Body: `[Synced from Vikunja] ${commentText}`,
      IsInternal: false,
      CommentType: "Comment",
    },
  });

  await updateSyncMapping(graphClient, mapping.id, { eventHash });
  context.log(`Added Vikunja comment to ticket ${ticketId}`);
  return { action: "comment_added", ticketId };
}

// ============================================
// Main HTTP handler
// ============================================

app.http("vikunjaWebhook", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Vikunja-Signature",
    };

    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    try {
      // Read raw body for HMAC verification
      const rawBody = await request.text();

      // Verify HMAC signature
      const signature = request.headers.get("X-Vikunja-Signature");
      if (!verifySignature(rawBody, signature)) {
        context.warn("Invalid or missing webhook signature");
        return {
          status: 401,
          headers: corsHeaders,
          jsonBody: { error: "Invalid webhook signature" },
        };
      }

      const body = JSON.parse(rawBody);

      // Vikunja webhook payload structure:
      // { event_name: "task.updated" | "task.comment.created", time: "...", data: { task, doer, comment? } }
      const event = body.event_name;
      const { data } = body;

      if (!event || !data) {
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: { error: "Missing event or data in webhook payload" },
        };
      }

      // Get Graph client
      const accessToken = await getAppToken();
      const graphClient = getGraphClient(accessToken);

      // Extract Vikunja task ID from event data
      // Vikunja nests the task object under data.task for all events
      const vikunjaTaskId = data.task?.id;

      if (!vikunjaTaskId) {
        context.log(`Could not extract task ID from webhook payload for event: ${event}`);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true, action: "skipped", reason: "no_task_id" },
        };
      }

      // Look up sync mapping
      const mapping = await getSyncMappingByVikunjaTaskId(graphClient, vikunjaTaskId);
      if (!mapping) {
        context.log(`No sync mapping for Vikunja task ${vikunjaTaskId}, ignoring webhook`);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true, action: "skipped", reason: "no_mapping" },
        };
      }

      // Check if sync is paused for this mapping
      if (mapping.fields.SyncStatus === "Paused") {
        context.log(`Sync paused for ticket ${mapping.fields.TicketId}, ignoring webhook`);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true, action: "skipped", reason: "sync_paused" },
        };
      }

      let result;
      switch (event) {
        case "task.updated":
          // Only handle when task is marked as done
          if (data.task?.done === true) {
            result = await handleTaskDone(graphClient, mapping, context);
          } else {
            result = { action: "skipped", reason: "task_not_done" };
          }
          break;

        case "task.comment.created": {
          const commentText = data.comment?.comment || data.comment?.text || "";
          result = await handleCommentCreated(graphClient, mapping, commentText, context);
          break;
        }

        default:
          context.log(`Unhandled webhook event: ${event}`);
          result = { action: "skipped", reason: "unhandled_event" };
          break;
      }

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: { success: true, ...result },
      };
    } catch (error) {
      context.error("Vikunja webhook processing failed:", error);
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { error: "Webhook processing failed", details: error.message },
      };
    }
  },
});
