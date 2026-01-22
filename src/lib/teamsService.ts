import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import {
  TeamsChannelConfig,
  TeamsMinPriority,
  PRIORITY_ORDER,
  AdaptiveCardBody,
  mapToTeamsChannelConfig,
  TeamsChannelSharePointItem,
} from "@/types/teams";

// SharePoint site and list IDs
const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TEAMS_CHANNELS_LIST_ID = process.env.NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID || "";

// App URL for card action buttons
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lively-coast-062dfc51e.1.azurestaticapps.net";

// Global kill switch for Teams notifications - defaults to DISABLED
// Set NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED=true to enable
const TEAMS_NOTIFICATIONS_ENABLED = process.env.NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED === "true";

// Date filter - only notify for tickets created on or after this date
// Format: YYYY-MM-DD (e.g., "2026-01-22")
// If not set, all tickets are eligible (when notifications are enabled)
const TEAMS_NOTIFICATIONS_START_DATE = process.env.NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE || "";

/**
 * Check if a ticket was created after the notification start date
 * Returns true if ticket should be notified, false if it's too old
 */
function isTicketAfterStartDate(ticket: Ticket): boolean {
  if (!TEAMS_NOTIFICATIONS_START_DATE) {
    return true; // No date filter configured, allow all
  }

  try {
    const startDate = new Date(TEAMS_NOTIFICATIONS_START_DATE);
    const ticketCreated = new Date(ticket.created);

    // Only notify for tickets created on or after the start date
    return ticketCreated >= startDate;
  } catch {
    console.warn("Invalid NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE format");
    return false; // If date is invalid, don't send notifications
  }
}

// Cache for Teams channel configuration (5-minute TTL)
let channelConfigCache: TeamsChannelConfig[] | null = null;
let channelConfigCacheTime: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// Configuration Loading
// ============================================

/**
 * Fetch Teams channel configuration from SharePoint list
 * Results are cached for 5 minutes to reduce API calls
 */
export async function fetchTeamsChannelConfig(client: Client): Promise<TeamsChannelConfig[]> {
  // Check cache
  if (channelConfigCache && Date.now() - channelConfigCacheTime < CACHE_TTL_MS) {
    return channelConfigCache;
  }

  if (!TEAMS_CHANNELS_LIST_ID) {
    console.warn("NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID not configured - Teams notifications disabled");
    return [];
  }

  try {
    const endpoint = `/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items?$expand=fields&$filter=fields/IsActive eq true`;
    const response = await client.api(endpoint).get();

    const configs: TeamsChannelConfig[] = response.value.map(
      (item: TeamsChannelSharePointItem) => mapToTeamsChannelConfig(item)
    );

    // Update cache
    channelConfigCache = configs;
    channelConfigCacheTime = Date.now();

    return configs;
  } catch (error) {
    console.error("Failed to fetch Teams channel configuration:", error);
    return [];
  }
}

/**
 * Find the Teams channel configuration for a ticket's department
 */
export function findChannelForTicket(
  configs: TeamsChannelConfig[],
  department: string
): TeamsChannelConfig | null {
  return configs.find(
    (config) => config.isActive && config.department.toLowerCase() === department.toLowerCase()
  ) || null;
}

/**
 * Check if a ticket's priority meets the minimum threshold for Teams notifications
 */
export function shouldNotifyTeams(
  ticketPriority: Ticket["priority"],
  minPriority: TeamsMinPriority
): boolean {
  return PRIORITY_ORDER[ticketPriority] >= PRIORITY_ORDER[minPriority];
}

// ============================================
// Adaptive Card Generation
// ============================================

/**
 * Generate an Adaptive Card for a new ticket notification
 * Blue accent style with full ticket details
 */
export function generateNewTicketCard(ticket: Ticket): AdaptiveCardBody {
  const truncatedDescription = ticket.description.length > 300
    ? ticket.description.substring(0, 300) + "..."
    : ticket.description;

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "Container",
        style: "accent",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "TextBlock",
            text: "New Ticket Created",
            size: "medium",
            weight: "bolder",
            color: "light",
          },
        ],
      },
      {
        type: "TextBlock",
        text: `#${ticket.id}: ${ticket.title}`,
        size: "large",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Priority", value: ticket.priority },
          { title: "Category", value: ticket.category },
          { title: "Department", value: formatDepartment(ticket) },
          { title: "Requester", value: ticket.originalRequester || ticket.requester.displayName },
          ...(ticket.location ? [{ title: "Location", value: ticket.location }] : []),
        ],
      },
      {
        type: "TextBlock",
        text: "Description",
        weight: "bolder",
        spacing: "medium",
      },
      {
        type: "TextBlock",
        text: truncatedDescription || "(No description provided)",
        wrap: true,
        isSubtle: true,
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "View Ticket",
        url: `${APP_URL}?ticket=${ticket.id}`,
      },
    ],
  };
}

/**
 * Generate an Adaptive Card for status change notification
 * Shows old status -> new status transition
 */
export function generateStatusChangeCard(
  ticket: Ticket,
  oldStatus: string,
  changedByName: string
): AdaptiveCardBody {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "Container",
        style: "emphasis",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "TextBlock",
            text: "Ticket Status Changed",
            size: "medium",
            weight: "bolder",
          },
        ],
      },
      {
        type: "TextBlock",
        text: `#${ticket.id}: ${ticket.title}`,
        size: "medium",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: oldStatus,
                size: "medium",
                color: "dark",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: "→",
                size: "medium",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: ticket.status,
                size: "medium",
                weight: "bolder",
                color: getStatusColor(ticket.status),
              },
            ],
          },
        ],
      },
      {
        type: "TextBlock",
        text: `Changed by ${changedByName}`,
        isSubtle: true,
        spacing: "small",
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "View Ticket",
        url: `${APP_URL}?ticket=${ticket.id}`,
      },
    ],
  };
}

/**
 * Generate an Adaptive Card for priority escalation notification
 * Orange/red warning style for escalated tickets
 */
export function generatePriorityEscalationCard(
  ticket: Ticket,
  oldPriority: string,
  changedByName: string
): AdaptiveCardBody {
  const isUrgent = ticket.priority === "Urgent";

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "Container",
        style: isUrgent ? "attention" : "warning",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "TextBlock",
            text: isUrgent ? "URGENT: Priority Escalated" : "Priority Escalated",
            size: "medium",
            weight: "bolder",
            color: "light",
          },
        ],
      },
      {
        type: "TextBlock",
        text: `#${ticket.id}: ${ticket.title}`,
        size: "medium",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: oldPriority,
                size: "medium",
                color: "dark",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: "→",
                size: "medium",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: ticket.priority,
                size: "medium",
                weight: "bolder",
                color: getPriorityColor(ticket.priority),
              },
            ],
          },
        ],
      },
      {
        type: "FactSet",
        facts: [
          { title: "Department", value: formatDepartment(ticket) },
          { title: "Requester", value: ticket.originalRequester || ticket.requester.displayName },
          { title: "Escalated by", value: changedByName },
        ],
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "View Ticket",
        url: `${APP_URL}?ticket=${ticket.id}`,
      },
    ],
  };
}

// ============================================
// Graph API - Post to Teams Channel
// ============================================

/**
 * Post an Adaptive Card message to a Teams channel
 */
export async function postToTeamsChannel(
  client: Client,
  teamId: string,
  channelId: string,
  card: AdaptiveCardBody
): Promise<void> {
  const endpoint = `/teams/${teamId}/channels/${channelId}/messages`;

  const message = {
    body: {
      contentType: "html",
      content: "<attachment id=\"card\"></attachment>",
    },
    attachments: [
      {
        id: "card",
        contentType: "application/vnd.microsoft.card.adaptive",
        content: JSON.stringify(card),
      },
    ],
  };

  await client.api(endpoint).post(message);
}

// ============================================
// Fire-and-Forget Notification Wrappers
// ============================================

/**
 * Send Teams notification for a new ticket
 * Fire-and-forget - errors are logged but don't block ticket creation
 */
export function sendNewTicketTeamsNotification(
  client: Client,
  ticket: Ticket
): void {
  // Check global kill switch
  if (!TEAMS_NOTIFICATIONS_ENABLED) {
    return;
  }

  // Check date filter (skip old/migrated tickets)
  if (!isTicketAfterStartDate(ticket)) {
    return;
  }

  // Run async without blocking
  (async () => {
    try {
      const configs = await fetchTeamsChannelConfig(client);
      const channelConfig = findChannelForTicket(configs, ticket.problemType);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}`);
        return;
      }

      if (!shouldNotifyTeams(ticket.priority, channelConfig.minPriority)) {
        console.log(`Ticket priority ${ticket.priority} below threshold ${channelConfig.minPriority} - skipping Teams notification`);
        return;
      }

      const card = generateNewTicketCard(ticket);
      await postToTeamsChannel(client, channelConfig.teamId, channelConfig.channelId, card);
      console.log(`Posted new ticket notification to Teams channel: ${channelConfig.title}`);
    } catch (error) {
      console.error("Failed to send new ticket Teams notification:", error);
    }
  })();
}

/**
 * Send Teams notification for a status change
 * Fire-and-forget - errors are logged but don't block ticket update
 */
export function sendStatusChangeTeamsNotification(
  client: Client,
  ticket: Ticket,
  oldStatus: string,
  changedByName: string
): void {
  // Check global kill switch
  if (!TEAMS_NOTIFICATIONS_ENABLED) {
    return;
  }

  // Check date filter (skip old/migrated tickets)
  if (!isTicketAfterStartDate(ticket)) {
    return;
  }

  // Run async without blocking
  (async () => {
    try {
      const configs = await fetchTeamsChannelConfig(client);
      const channelConfig = findChannelForTicket(configs, ticket.problemType);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}`);
        return;
      }

      if (!shouldNotifyTeams(ticket.priority, channelConfig.minPriority)) {
        console.log(`Ticket priority ${ticket.priority} below threshold ${channelConfig.minPriority} - skipping Teams notification`);
        return;
      }

      const card = generateStatusChangeCard(ticket, oldStatus, changedByName);
      await postToTeamsChannel(client, channelConfig.teamId, channelConfig.channelId, card);
      console.log(`Posted status change notification to Teams channel: ${channelConfig.title}`);
    } catch (error) {
      console.error("Failed to send status change Teams notification:", error);
    }
  })();
}

/**
 * Send Teams notification for a priority escalation
 * Fire-and-forget - errors are logged but don't block ticket update
 * Only sends if new priority > old priority AND new priority meets threshold
 */
export function sendPriorityEscalationTeamsNotification(
  client: Client,
  ticket: Ticket,
  oldPriority: string,
  changedByName: string
): void {
  // Check global kill switch
  if (!TEAMS_NOTIFICATIONS_ENABLED) {
    return;
  }

  // Check date filter (skip old/migrated tickets)
  if (!isTicketAfterStartDate(ticket)) {
    return;
  }

  // Run async without blocking
  (async () => {
    try {
      // Only notify on escalation (priority increase)
      const oldPriorityOrder = PRIORITY_ORDER[oldPriority as TeamsMinPriority] ?? 0;
      const newPriorityOrder = PRIORITY_ORDER[ticket.priority];

      if (newPriorityOrder <= oldPriorityOrder) {
        console.log(`Priority change ${oldPriority} → ${ticket.priority} is not an escalation - skipping Teams notification`);
        return;
      }

      const configs = await fetchTeamsChannelConfig(client);
      const channelConfig = findChannelForTicket(configs, ticket.problemType);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}`);
        return;
      }

      if (!shouldNotifyTeams(ticket.priority, channelConfig.minPriority)) {
        console.log(`Ticket priority ${ticket.priority} below threshold ${channelConfig.minPriority} - skipping Teams notification`);
        return;
      }

      const card = generatePriorityEscalationCard(ticket, oldPriority, changedByName);
      await postToTeamsChannel(client, channelConfig.teamId, channelConfig.channelId, card);
      console.log(`Posted priority escalation notification to Teams channel: ${channelConfig.title}`);
    } catch (error) {
      console.error("Failed to send priority escalation Teams notification:", error);
    }
  })();
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format department hierarchy for display
 */
function formatDepartment(ticket: Ticket): string {
  let dept = ticket.problemType;
  if (ticket.problemTypeSub) {
    dept += ` > ${ticket.problemTypeSub}`;
  }
  if (ticket.problemTypeSub2) {
    dept += ` > ${ticket.problemTypeSub2}`;
  }
  return dept;
}

/**
 * Get Adaptive Card color for ticket status
 */
function getStatusColor(status: string): "default" | "good" | "warning" | "attention" | "accent" {
  switch (status) {
    case "New":
      return "accent";
    case "In Progress":
      return "good";
    case "On Hold":
      return "warning";
    case "Resolved":
      return "good";
    case "Closed":
      return "default";
    default:
      return "default";
  }
}

/**
 * Get Adaptive Card color for priority
 */
function getPriorityColor(priority: string): "default" | "good" | "warning" | "attention" {
  switch (priority) {
    case "Low":
      return "default";
    case "Normal":
      return "default";
    case "High":
      return "warning";
    case "Urgent":
      return "attention";
    default:
      return "default";
  }
}
