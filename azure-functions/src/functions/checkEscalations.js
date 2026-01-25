const { app } = require("@azure/functions");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

// Configuration from environment variables
const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  senderEmail: process.env.SENDER_EMAIL || "supportdesk@skyparksantasvillage.com",
  siteId: process.env.SHAREPOINT_SITE_ID,
  ticketsListId: process.env.TICKETS_LIST_ID,
  escalationListId: process.env.ESCALATION_LIST_ID,
  commentsListId: process.env.COMMENTS_LIST_ID,
  appUrl: process.env.APP_URL || "https://tickets.spsvent.net",
};

// Create MSAL confidential client for app-only auth
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

// Get app-only access token
async function getAppToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return result.accessToken;
}

// Create Graph client with app-only token
function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// Fetch escalation rules
async function getEscalationRules(client) {
  if (!config.escalationListId) {
    console.log("Escalation list not configured");
    return [];
  }

  const endpoint = `/sites/${config.siteId}/lists/${config.escalationListId}/items?$expand=fields&$top=500`;
  const response = await client.api(endpoint).get();

  return (response.value || [])
    .map((item) => ({
      id: item.id,
      title: item.fields.Title,
      triggerType: item.fields.TriggerType,
      triggerHours: item.fields.TriggerHours || 24,
      matchPriority: item.fields.MatchPriority,
      matchStatus: item.fields.MatchStatus,
      matchDepartment: item.fields.MatchDepartment,
      actionType: item.fields.ActionType,
      escalateToPriority: item.fields.EscalateToPriority,
      notifyEmail: item.fields.NotifyEmail,
      reassignToEmail: item.fields.ReassignToEmail,
      sortOrder: item.fields.SortOrder ?? 100,
      isActive: item.fields.IsActive !== false,
    }))
    .filter((rule) => rule.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Fetch open tickets
async function getOpenTickets(client) {
  const endpoint = `/sites/${config.siteId}/lists/${config.ticketsListId}/items?$expand=fields&$top=500`;
  const response = await client.api(endpoint).get();

  return (response.value || [])
    .map((item) => ({
      id: item.id,
      ticketNumber: item.fields.TicketNumber,
      title: item.fields.Title,
      status: item.fields.Status,
      priority: item.fields.Priority,
      department: item.fields.ProblemType,
      assignedTo: item.fields.AssignedTo,
      created: item.fields.Created || item.createdDateTime,
      modified: item.fields.Modified || item.lastModifiedDateTime,
      escalatedAt: item.fields.EscalatedAt,
    }))
    .filter((ticket) => !["Resolved", "Closed"].includes(ticket.status));
}

// Get comments for a ticket
async function getTicketComments(client, ticketId) {
  const endpoint = `/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketId eq '${ticketId}'`;

  try {
    const response = await client.api(endpoint).get();
    return response.value || [];
  } catch {
    return [];
  }
}

// Check if rule matches ticket
function ruleMatchesTicket(rule, ticket) {
  if (rule.matchPriority && rule.matchPriority !== ticket.priority) {
    return false;
  }
  if (rule.matchStatus && rule.matchStatus !== ticket.status) {
    return false;
  }
  if (rule.matchDepartment && rule.matchDepartment !== ticket.department) {
    return false;
  }
  return true;
}

// Check if trigger condition is met
async function checkTriggerCondition(client, rule, ticket) {
  const now = new Date();
  const thresholdMs = rule.triggerHours * 60 * 60 * 1000;

  switch (rule.triggerType) {
    case "no_response": {
      // Check if there are any comments
      const comments = await getTicketComments(client, ticket.id);
      if (comments.length > 0) {
        return false; // Has responses
      }
      // Check time since creation
      const createdTime = new Date(ticket.created);
      return now - createdTime >= thresholdMs;
    }

    case "no_update": {
      // Check time since last modification
      const modifiedTime = new Date(ticket.modified);
      return now - modifiedTime >= thresholdMs;
    }

    case "approaching_sla": {
      // SLA not implemented yet
      return false;
    }

    default:
      return false;
  }
}

// Send notification email
async function sendNotificationEmail(client, toEmail, ticket, rule) {
  const endpoint = `/users/${config.senderEmail}/sendMail`;

  const subject = `[Escalation Alert] Ticket #${ticket.ticketNumber}: ${ticket.title}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #dc2626;">Ticket Escalation Alert</h2>
      <p>A ticket has triggered an escalation rule:</p>

      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0;"><strong>Rule:</strong> ${rule.title || rule.triggerType}</p>
        <p style="margin: 8px 0 0 0;"><strong>Trigger:</strong> ${rule.triggerType.replace("_", " ")} after ${rule.triggerHours} hours</p>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket #</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticketNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Title</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.title}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Status</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.status}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Priority</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Assigned To</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.assignedTo || "Unassigned"}</td>
        </tr>
      </table>

      <p style="margin-top: 24px;">
        <a href="${config.appUrl}?ticket=${ticket.id}"
           style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          View Ticket
        </a>
      </p>
    </div>
  `;

  try {
    await client.api(endpoint).post({
      message: {
        subject,
        body: { contentType: "HTML", content: htmlContent },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: true,
    });
    console.log(`Sent escalation notification to ${toEmail} for ticket #${ticket.ticketNumber}`);
  } catch (error) {
    console.error(`Failed to send notification to ${toEmail}:`, error.message);
  }
}

// Update ticket priority
async function escalateTicketPriority(client, ticket, newPriority) {
  const endpoint = `/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticket.id}/fields`;

  try {
    await client.api(endpoint).patch({
      Priority: newPriority,
      EscalatedAt: new Date().toISOString(),
    });
    console.log(`Escalated ticket #${ticket.ticketNumber} priority to ${newPriority}`);
  } catch (error) {
    console.error(`Failed to escalate ticket #${ticket.ticketNumber}:`, error.message);
  }
}

// Reassign ticket
async function reassignTicket(client, ticket, newAssignee) {
  const endpoint = `/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticket.id}/fields`;

  try {
    await client.api(endpoint).patch({
      AssignedTo: newAssignee,
      EscalatedAt: new Date().toISOString(),
    });
    console.log(`Reassigned ticket #${ticket.ticketNumber} to ${newAssignee}`);
  } catch (error) {
    console.error(`Failed to reassign ticket #${ticket.ticketNumber}:`, error.message);
  }
}

// Execute escalation action
async function executeAction(client, rule, ticket) {
  switch (rule.actionType) {
    case "notify":
      if (rule.notifyEmail) {
        await sendNotificationEmail(client, rule.notifyEmail, ticket, rule);
      }
      break;

    case "escalate_priority":
      if (rule.escalateToPriority) {
        await escalateTicketPriority(client, ticket, rule.escalateToPriority);
      }
      break;

    case "reassign":
      if (rule.reassignToEmail) {
        await reassignTicket(client, ticket, rule.reassignToEmail);
      }
      break;

    case "escalate_and_notify":
      if (rule.escalateToPriority) {
        await escalateTicketPriority(client, ticket, rule.escalateToPriority);
      }
      if (rule.notifyEmail) {
        await sendNotificationEmail(client, rule.notifyEmail, ticket, rule);
      }
      break;
  }
}

// Main escalation check function
async function runEscalationCheck(context) {
  context.log("Starting escalation check...");

  // Validate configuration
  if (!config.siteId || !config.ticketsListId) {
    context.log("SharePoint configuration missing. Skipping escalation check.");
    return { checked: 0, escalated: 0, skipped: true };
  }

  try {
    const accessToken = await getAppToken();
    const client = getGraphClient(accessToken);

    // Fetch rules and tickets
    const rules = await getEscalationRules(client);
    context.log(`Found ${rules.length} active escalation rules`);

    if (rules.length === 0) {
      return { checked: 0, escalated: 0, noRules: true };
    }

    const tickets = await getOpenTickets(client);
    context.log(`Found ${tickets.length} open tickets`);

    let escalatedCount = 0;

    // Check each ticket against rules
    for (const ticket of tickets) {
      // Skip if already escalated recently (within last hour)
      if (ticket.escalatedAt) {
        const escalatedTime = new Date(ticket.escalatedAt);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (escalatedTime > hourAgo) {
          continue;
        }
      }

      // Find first matching rule
      for (const rule of rules) {
        if (!ruleMatchesTicket(rule, ticket)) {
          continue;
        }

        const shouldEscalate = await checkTriggerCondition(client, rule, ticket);
        if (shouldEscalate) {
          context.log(`Ticket #${ticket.ticketNumber} matches rule "${rule.title || rule.triggerType}"`);
          await executeAction(client, rule, ticket);
          escalatedCount++;
          break; // Only apply first matching rule
        }
      }
    }

    context.log(`Escalation check complete. Escalated ${escalatedCount} tickets.`);
    return { checked: tickets.length, escalated: escalatedCount };
  } catch (error) {
    context.error("Escalation check failed:", error);
    throw error;
  }
}

// Timer trigger - runs every hour
app.timer("checkEscalations", {
  schedule: "0 0 * * * *", // Every hour at minute 0
  handler: async (myTimer, context) => {
    context.log("Timer trigger fired at", new Date().toISOString());
    const result = await runEscalationCheck(context);
    context.log("Result:", result);
  },
});

// HTTP trigger for manual runs and testing
app.http("runEscalationCheck", {
  methods: ["POST", "GET"],
  authLevel: "function",
  handler: async (request, context) => {
    context.log("Manual escalation check triggered");

    try {
      const result = await runEscalationCheck(context);
      return {
        status: 200,
        jsonBody: {
          success: true,
          message: "Escalation check completed",
          ...result,
        },
      };
    } catch (error) {
      return {
        status: 500,
        jsonBody: {
          success: false,
          error: error.message,
        },
      };
    }
  },
});
