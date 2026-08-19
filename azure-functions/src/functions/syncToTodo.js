const { app } = require("@azure/functions");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

// Configuration from environment variables
const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  siteId: process.env.SHAREPOINT_SITE_ID,
  syncMapListId: process.env.TODO_SYNC_MAP_LIST_ID,
  // The mailbox whose Microsoft To Do these tasks land in (UPN).
  targetUser: process.env.TODO_TARGET_USER,
  // The To Do list these tasks live in. Resolved (and created if missing) by name at
  // runtime, so no GUID needs wiring. Set TODO_LIST_ID to skip the lookup.
  listName: process.env.TODO_LIST_NAME || "SkyPark Tech Tickets",
  listId: process.env.TODO_LIST_ID || null,
  appUrl: process.env.APP_URL || "https://tickets.spsvent.net",
};

// Ticket priority → To Do task importance (enum: low | normal | high)
const IMPORTANCE_MAP = {
  Urgent: "high",
  High: "high",
  Normal: "normal",
  Low: "low",
};

// A ticket in one of these statuses is "done" — the To Do task is checked off.
const RESOLVED_STATUSES = ["Resolved", "Closed"];
const isResolved = (status) => RESOLVED_STATUSES.includes(status);

// MSAL singleton (app-only token)
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
// Microsoft To Do helpers (Graph, app-only)
// Requires the Tasks.ReadWrite.All application permission with admin consent.
// ============================================

// Resolve the target To Do list id, creating the list on first use. Cached across
// invocations (warm instances) so we only hit /todo/lists once.
let cachedListId = config.listId;
async function resolveListId(graphClient, context) {
  if (cachedListId) return cachedListId;

  const res = await graphClient.api(`/users/${config.targetUser}/todo/lists`).get();
  const found = (res.value || []).find((l) => l.displayName === config.listName);
  if (found) {
    cachedListId = found.id;
    return cachedListId;
  }

  const created = await graphClient
    .api(`/users/${config.targetUser}/todo/lists`)
    .post({ displayName: config.listName });
  cachedListId = created.id;
  context.log(`Created To Do list "${config.listName}" (${cachedListId})`);
  return cachedListId;
}

function tasksBase(listId) {
  return `/users/${config.targetUser}/todo/lists/${listId}/tasks`;
}

function ticketWebUrl(ticketId) {
  return `${config.appUrl}?ticket=${ticketId}`;
}

function taskBody({ priority, requesterName, assigneeName, ticketId }) {
  const lines = [
    `Priority: ${priority || "Normal"}`,
    requesterName ? `Requester: ${requesterName}` : null,
    assigneeName ? `Assigned to: ${assigneeName}` : null,
    "",
    `Open ticket: ${ticketWebUrl(ticketId)}`,
  ].filter((l) => l !== null);
  return { contentType: "text", content: lines.join("\n") };
}

async function createTodoTask(graphClient, listId, body, context) {
  const { ticketNumber, title, priority, ticketId, dueDate, status } = body;

  const payload = {
    title: `[HD-${ticketNumber}] ${title}`,
    importance: IMPORTANCE_MAP[priority] || "normal",
    body: taskBody(body),
    status: isResolved(status) ? "completed" : "notStarted",
  };
  if (dueDate) {
    payload.dueDateTime = { dateTime: new Date(dueDate).toISOString(), timeZone: "UTC" };
  }

  const task = await graphClient.api(tasksBase(listId)).post(payload);

  // Attach a linked resource so the task deep-links back to the ticket (best-effort).
  try {
    await graphClient.api(`${tasksBase(listId)}/${task.id}/linkedResources`).post({
      webUrl: ticketWebUrl(ticketId),
      applicationName: "SkyPark Help Desk",
      displayName: `Ticket #${ticketNumber}`,
    });
  } catch (linkErr) {
    context.log(`Warning: could not attach linked resource to task ${task.id}: ${linkErr.message}`);
  }

  return task;
}

async function patchTodoTask(graphClient, listId, taskId, patch) {
  return graphClient.api(`${tasksBase(listId)}/${taskId}`).patch(patch);
}

// ============================================
// SyncMap helpers (SharePoint list) — one-directional (Help Desk → To Do)
// ============================================

async function getSyncMapping(graphClient, ticketId) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items?$filter=fields/TicketId eq '${ticketId}'&$expand=fields`;
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

async function createSyncMapping(graphClient, data) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items`;
  return graphClient.api(endpoint).post({
    fields: {
      Title: String(data.ticketNumber),
      TicketId: String(data.ticketId),
      TodoTaskId: data.todoTaskId,
      LastSyncTimestamp: new Date().toISOString(),
      SyncStatus: "Active",
    },
  });
}

async function updateSyncMapping(graphClient, itemId, data) {
  const endpoint = `/sites/${config.siteId}/lists/${config.syncMapListId}/items/${itemId}`;
  return graphClient.api(endpoint).patch({
    fields: {
      LastSyncTimestamp: new Date().toISOString(),
      SyncStatus: data.syncStatus || "Active",
      ...(data.todoTaskId ? { TodoTaskId: data.todoTaskId } : {}),
      ...(data.lastError ? { LastError: data.lastError } : {}),
    },
  });
}

// ============================================
// Event handlers
// ============================================

async function handleTicketCreated(graphClient, listId, body, context) {
  const { ticketId, ticketNumber, assigneeEmail } = body;

  // Idempotency — never create a second task for a ticket we already mapped.
  const existing = await getSyncMapping(graphClient, ticketId);
  if (existing) {
    context.log(`To Do mapping already exists for ticket ${ticketId}, skipping creation`);
    return { action: "skipped", reason: "already_mapped" };
  }

  // Scope gate: Tech tickets that actually have an assignee.
  if (!assigneeEmail) {
    return { action: "skipped", reason: "no_assignee" };
  }

  const task = await createTodoTask(graphClient, listId, body, context);
  await createSyncMapping(graphClient, { ticketId, ticketNumber, todoTaskId: task.id });

  context.log(`Created To Do task ${task.id} for ticket #${ticketNumber}`);
  return { action: "created", todoTaskId: task.id };
}

async function handleTicketUpdated(graphClient, listId, body, context) {
  const { ticketId, ticketNumber, title, priority, assigneeEmail, changedFields } = body;

  const mapping = await getSyncMapping(graphClient, ticketId);

  // Upsert: a Tech ticket that just gained an assignee (e.g. was created unassigned)
  // has no mapping yet — create the task now.
  if (!mapping) {
    if (assigneeEmail) {
      return handleTicketCreated(graphClient, listId, body, context);
    }
    context.log(`No To Do mapping for ticket ${ticketId} and no assignee, skipping update`);
    return { action: "skipped", reason: "no_mapping" };
  }

  const taskId = mapping.fields.TodoTaskId;

  // Unassigned while still Tech → check the task off and pause the mapping.
  if (!assigneeEmail) {
    await patchTodoTask(graphClient, listId, taskId, { status: "completed" });
    await updateSyncMapping(graphClient, mapping.id, {
      syncStatus: "Paused",
      lastError: "Ticket unassigned; task completed and mapping paused",
    });
    context.log(`Completed + paused To Do task ${taskId} (ticket ${ticketId} unassigned)`);
    return { action: "paused", reason: "unassigned", todoTaskId: taskId };
  }

  // Keep title + importance in sync on every update.
  const patch = {
    title: `[HD-${ticketNumber}] ${title}`,
    importance: IMPORTANCE_MAP[priority] || "normal",
  };
  // Only touch completion state when the ticket's status actually changed, so we
  // never un-check a task the user manually completed during an unrelated edit.
  if (changedFields && changedFields.status) {
    patch.status = isResolved(changedFields.status.new) ? "completed" : "notStarted";
  }

  await patchTodoTask(graphClient, listId, taskId, patch);
  await updateSyncMapping(graphClient, mapping.id, { syncStatus: "Active" });

  context.log(`Updated To Do task ${taskId} for ticket ${ticketId}`);
  return { action: "updated", todoTaskId: taskId };
}

// Ticket recategorized away from Tech: check the task off and pause the mapping so
// later edits don't keep mirroring a ticket that no longer belongs to the Tech queue.
async function handleTicketRecategorized(graphClient, listId, body, context) {
  const { ticketId, oldProblemType, newProblemType } = body;

  const mapping = await getSyncMapping(graphClient, ticketId);
  if (!mapping) {
    context.log(`No To Do mapping for ticket ${ticketId}, nothing to pause`);
    return { action: "skipped", reason: "no_mapping" };
  }
  if (mapping.fields.SyncStatus === "Paused") {
    return { action: "skipped", reason: "already_paused" };
  }

  try {
    await patchTodoTask(graphClient, listId, mapping.fields.TodoTaskId, { status: "completed" });
  } catch (e) {
    context.log(`Warning: could not complete To Do task on recategorize: ${e.message}`);
  }
  await updateSyncMapping(graphClient, mapping.id, {
    syncStatus: "Paused",
    lastError: `Ticket recategorized from ${oldProblemType ?? "Tech"} to ${newProblemType ?? "non-Tech"}; mapping paused`,
  });

  context.log(`Paused To Do mapping for ticket ${ticketId} (recategorized to ${newProblemType})`);
  return { action: "paused", ticketId, todoTaskId: mapping.fields.TodoTaskId };
}

// ============================================
// Main HTTP handler
// ============================================

app.http("syncToTodo", {
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
      if (!config.targetUser || !config.syncMapListId) {
        return {
          status: 500,
          headers: corsHeaders,
          jsonBody: { error: "To Do sync not configured (TODO_TARGET_USER / TODO_SYNC_MAP_LIST_ID)" },
        };
      }

      const accessToken = await getAppToken();
      const graphClient = getGraphClient(accessToken);
      const listId = await resolveListId(graphClient, context);

      let result;
      switch (eventType) {
        case "ticket_created":
          result = await handleTicketCreated(graphClient, listId, body, context);
          break;
        case "ticket_updated":
          result = await handleTicketUpdated(graphClient, listId, body, context);
          break;
        case "ticket_recategorized":
          result = await handleTicketRecategorized(graphClient, listId, body, context);
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
      context.error("To Do sync failed:", error);

      // Best-effort: stamp the mapping with the error for later inspection.
      try {
        const body = await request.clone().json().catch(() => null);
        if (body?.ticketId) {
          const accessToken = await getAppToken();
          const graphClient = getGraphClient(accessToken);
          const mapping = await getSyncMapping(graphClient, body.ticketId);
          if (mapping) {
            await updateSyncMapping(graphClient, mapping.id, {
              syncStatus: "Error",
              lastError: error.message,
            });
          }
        }
      } catch {
        // swallow — error logging is best-effort
      }

      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { error: "To Do sync failed", details: error.message },
      };
    }
  },
});
