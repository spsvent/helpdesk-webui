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
  syncMapListId: process.env.VIKUNJA_SYNC_MAP_LIST_ID,
  vikunjaBaseUrl: process.env.VIKUNJA_BASE_URL,
  vikunjaApiToken: process.env.VIKUNJA_API_TOKEN,
  vikunjaProjectId: parseInt(process.env.VIKUNJA_PROJECT_ID || "0"),
};

// Priority mapping: HD → Vikunja (1=Low, 2=Normal/unset, 3=High, 4=Urgent)
const PRIORITY_MAP = {
  Low: 1,
  Normal: 0, // Vikunja uses 0 for "unset" (default/normal)
  High: 3,
  Urgent: 4,
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
// Vikunja API helpers
// ============================================

async function vikunjaRequest(method, path, body) {
  const url = `${config.vikunjaBaseUrl}/api/v1${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${config.vikunjaApiToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vikunja API ${method} ${path} failed (${response.status}): ${text}`);
  }
  return response.json();
}

// ============================================
// SyncMap helpers (SharePoint list)
// ============================================

async function getSyncMapping(graphClient, ticketId) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items?$filter=fields/TicketId eq '${ticketId}'&$expand=fields`;
  try {
    const response = await graphClient.api(endpoint).get();
    return response.value.length > 0 ? response.value[0] : null;
  } catch {
    return null;
  }
}

async function createSyncMapping(graphClient, data) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items`;
  return graphClient.api(endpoint).post({
    fields: {
      Title: String(data.ticketNumber),
      TicketId: String(data.ticketId),
      VikunjaTaskId: data.vikunjaTaskId,
      VikunjaProjectId: data.vikunjaProjectId,
      LastSyncSource: "HelpDesk",
      LastSyncTimestamp: new Date().toISOString(),
      LastEventHash: data.eventHash,
      SyncStatus: "Active",
    },
  });
}

async function updateSyncMapping(graphClient, itemId, data) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items/${itemId}`;
  return graphClient.api(endpoint).patch({
    fields: {
      LastSyncSource: "HelpDesk",
      LastSyncTimestamp: new Date().toISOString(),
      LastEventHash: data.eventHash,
      SyncStatus: data.syncStatus || "Active",
      ...(data.lastError ? { LastError: data.lastError } : {}),
    },
  });
}

// ============================================
// Event hash for deduplication
// ============================================

function computeEventHash(ticketId, eventType, keyData) {
  return crypto
    .createHash("sha256")
    .update(`${ticketId}:${eventType}:${JSON.stringify(keyData)}`)
    .digest("hex");
}

// ============================================
// Event handlers
// ============================================

async function handleTicketCreated(graphClient, body, context) {
  const { ticketId, ticketNumber, title, description, priority, requesterName, assigneeName } = body;

  // Check if mapping already exists (idempotency)
  const existing = await getSyncMapping(graphClient, ticketId);
  if (existing) {
    context.log(`Sync mapping already exists for ticket ${ticketId}, skipping creation`);
    return { action: "skipped", reason: "already_mapped" };
  }

  // Create task in Vikunja
  const task = await vikunjaRequest("PUT", `/projects/${config.vikunjaProjectId}/tasks`, {
    title: `[HD-${ticketNumber}] ${title}`,
    description: `${description}\n\n---\n*Requester: ${requesterName}*${assigneeName ? `\n*Assigned to: ${assigneeName}*` : ""}`,
    priority: PRIORITY_MAP[priority] ?? 0,
  });

  // Create sync mapping
  const eventHash = computeEventHash(ticketId, "ticket_created", { ticketNumber });
  await createSyncMapping(graphClient, {
    ticketId,
    ticketNumber,
    vikunjaTaskId: task.id,
    vikunjaProjectId: config.vikunjaProjectId,
    eventHash,
  });

  context.log(`Created Vikunja task ${task.id} for ticket #${ticketNumber}`);
  return { action: "created", vikunjaTaskId: task.id };
}

async function handleTicketUpdated(graphClient, body, context) {
  const { ticketId, changedFields, priority, actorName } = body;

  const mapping = await getSyncMapping(graphClient, ticketId);
  if (!mapping) {
    context.log(`No sync mapping for ticket ${ticketId}, skipping update`);
    return { action: "skipped", reason: "no_mapping" };
  }

  const vikunjaTaskId = mapping.fields.VikunjaTaskId;

  // Dedup check
  const eventHash = computeEventHash(ticketId, "ticket_updated", changedFields);
  if (mapping.fields.LastEventHash === eventHash) {
    context.log(`Duplicate event for ticket ${ticketId}, skipping`);
    return { action: "skipped", reason: "duplicate" };
  }

  // Time window check — skip if Vikunja synced within 5 seconds
  if (mapping.fields.LastSyncSource === "Vikunja") {
    const lastSync = new Date(mapping.fields.LastSyncTimestamp).getTime();
    if (Date.now() - lastSync < 5000) {
      context.log(`Recent Vikunja sync for ticket ${ticketId}, skipping to prevent loop`);
      return { action: "skipped", reason: "recent_vikunja_sync" };
    }
  }

  // Build Vikunja update payload
  const updatePayload = {};
  if (changedFields.priority) {
    updatePayload.priority = PRIORITY_MAP[priority] ?? 0;
  }

  // Add comment describing all changes
  const changeDescriptions = [];
  if (changedFields.status) {
    changeDescriptions.push(`Status: ${changedFields.status.old} → ${changedFields.status.new}`);
  }
  if (changedFields.priority) {
    changeDescriptions.push(`Priority: ${changedFields.priority.old} → ${changedFields.priority.new}`);
  }
  if (changedFields.assignee) {
    changeDescriptions.push(`Assignee: ${changedFields.assignee.old || "Unassigned"} → ${changedFields.assignee.new || "Unassigned"}`);
  }

  if (changeDescriptions.length > 0) {
    await vikunjaRequest("PUT", `/tasks/${vikunjaTaskId}/comments`, {
      comment: `[Synced from Help Desk] ${actorName} updated:\n${changeDescriptions.join("\n")}`,
    });
  }

  // Update task fields if needed
  if (Object.keys(updatePayload).length > 0) {
    await vikunjaRequest("POST", `/tasks/${vikunjaTaskId}`, updatePayload);
  }

  await updateSyncMapping(graphClient, mapping.id, { eventHash });
  context.log(`Updated Vikunja task ${vikunjaTaskId} for ticket ${ticketId}`);
  return { action: "updated", vikunjaTaskId };
}

async function handleTicketResolved(graphClient, body, context) {
  const { ticketId, actorName, changedFields } = body;

  const mapping = await getSyncMapping(graphClient, ticketId);
  if (!mapping) {
    context.log(`No sync mapping for ticket ${ticketId}, skipping resolve`);
    return { action: "skipped", reason: "no_mapping" };
  }

  const vikunjaTaskId = mapping.fields.VikunjaTaskId;

  // Dedup check
  const eventHash = computeEventHash(ticketId, "ticket_resolved", { status: body.status });
  if (mapping.fields.LastEventHash === eventHash) {
    return { action: "skipped", reason: "duplicate" };
  }

  // Time window check
  if (mapping.fields.LastSyncSource === "Vikunja") {
    const lastSync = new Date(mapping.fields.LastSyncTimestamp).getTime();
    if (Date.now() - lastSync < 5000) {
      context.log(`Recent Vikunja sync for ticket ${ticketId}, skipping to prevent loop`);
      return { action: "skipped", reason: "recent_vikunja_sync" };
    }
  }

  // Mark task as done in Vikunja
  await vikunjaRequest("POST", `/tasks/${vikunjaTaskId}`, { done: true });

  // Add a comment noting the resolution
  const statusChange = changedFields?.status
    ? `${changedFields.status.old} → ${changedFields.status.new}`
    : "Resolved";
  await vikunjaRequest("PUT", `/tasks/${vikunjaTaskId}/comments`, {
    comment: `[Synced from Help Desk] ${actorName} resolved this ticket (${statusChange})`,
  });

  await updateSyncMapping(graphClient, mapping.id, { eventHash });
  context.log(`Marked Vikunja task ${vikunjaTaskId} as done for ticket ${ticketId}`);
  return { action: "resolved", vikunjaTaskId };
}

async function handleCommentAdded(graphClient, body, context) {
  const { ticketId, text } = body;

  const mapping = await getSyncMapping(graphClient, ticketId);
  if (!mapping) {
    context.log(`No sync mapping for ticket ${ticketId}, skipping comment`);
    return { action: "skipped", reason: "no_mapping" };
  }

  const vikunjaTaskId = mapping.fields.VikunjaTaskId;

  // Dedup check
  const eventHash = computeEventHash(ticketId, "comment_added", { text: text.substring(0, 100) });
  if (mapping.fields.LastEventHash === eventHash) {
    return { action: "skipped", reason: "duplicate" };
  }

  // Time window check
  if (mapping.fields.LastSyncSource === "Vikunja") {
    const lastSync = new Date(mapping.fields.LastSyncTimestamp).getTime();
    if (Date.now() - lastSync < 5000) {
      context.log(`Recent Vikunja sync for ticket ${ticketId}, skipping to prevent loop`);
      return { action: "skipped", reason: "recent_vikunja_sync" };
    }
  }

  // Add comment to Vikunja task
  await vikunjaRequest("PUT", `/tasks/${vikunjaTaskId}/comments`, {
    comment: text,
  });

  await updateSyncMapping(graphClient, mapping.id, { eventHash });
  context.log(`Added comment to Vikunja task ${vikunjaTaskId} for ticket ${ticketId}`);
  return { action: "comment_added", vikunjaTaskId };
}

// ============================================
// Main HTTP handler
// ============================================

app.http("syncToVikunja", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const body = await request.json();
      const { eventType, ticketId } = body;

      if (!eventType || !ticketId) {
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: { error: "Missing required fields: eventType, ticketId" },
        };
      }

      // Validate configuration
      if (!config.vikunjaBaseUrl || !config.vikunjaApiToken || !config.vikunjaProjectId) {
        return {
          status: 500,
          headers: corsHeaders,
          jsonBody: { error: "Vikunja configuration not set in environment variables" },
        };
      }

      // Get Graph client for SharePoint access
      const accessToken = await getAppToken();
      const graphClient = getGraphClient(accessToken);

      let result;
      switch (eventType) {
        case "ticket_created":
          result = await handleTicketCreated(graphClient, body, context);
          break;
        case "ticket_updated":
          result = await handleTicketUpdated(graphClient, body, context);
          break;
        case "ticket_resolved":
          result = await handleTicketResolved(graphClient, body, context);
          break;
        case "comment_added":
          result = await handleCommentAdded(graphClient, body, context);
          break;
        default:
          return {
            status: 400,
            headers: corsHeaders,
            jsonBody: { error: `Unknown eventType: ${eventType}` },
          };
      }

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: { success: true, ...result },
      };
    } catch (error) {
      context.error("Vikunja sync failed:", error);

      // Try to update sync mapping with error status
      try {
        const body = await request.clone().json().catch(() => null);
        if (body?.ticketId) {
          const accessToken = await getAppToken();
          const graphClient = getGraphClient(accessToken);
          const mapping = await getSyncMapping(graphClient, body.ticketId);
          if (mapping) {
            await updateSyncMapping(graphClient, mapping.id, {
              eventHash: mapping.fields.LastEventHash,
              syncStatus: "Error",
              lastError: error.message,
            });
          }
        }
      } catch {
        // Best-effort error logging
      }

      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { error: "Vikunja sync failed", details: error.message },
      };
    }
  },
});
