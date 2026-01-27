import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import {
  TeamsChannelConfig,
  TeamsMinPriority,
  PRIORITY_ORDER,
  AdaptiveCardBody,
  AdaptiveCardElement,
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
    // Fetch all items and filter client-side (IsActive column may not be indexed)
    const endpoint = `/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items?$expand=fields`;
    const response = await client.api(endpoint).get();

    const allConfigs: TeamsChannelConfig[] = response.value.map(
      (item: TeamsChannelSharePointItem) => mapToTeamsChannelConfig(item)
    );

    // Filter to only active channels client-side
    const configs = allConfigs.filter(config => config.isActive);

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
 * Get emoji indicator for priority
 */
function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case "Low": return "🟢";
    case "Normal": return "🔵";
    case "High": return "🟠";
    case "Urgent": return "🔴";
    default: return "⚪";
  }
}

/**
 * Get emoji indicator for category
 */
function getCategoryEmoji(category: string): string {
  switch (category) {
    case "Request": return "📋";
    case "Incident": return "⚠️";
    case "Problem": return "🔧";
    default: return "📌";
  }
}

/**
 * Format date for display
 */
function formatCardDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

/**
 * Generate an Adaptive Card for a new ticket notification
 * Modern design with clear visual hierarchy
 */
export function generateNewTicketCard(ticket: Ticket): AdaptiveCardBody {
  const truncatedDescription = ticket.description.length > 200
    ? ticket.description.substring(0, 200) + "..."
    : ticket.description;

  const priorityEmoji = getPriorityEmoji(ticket.priority);
  const categoryEmoji = getCategoryEmoji(ticket.category);

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      // Header with accent background
      {
        type: "Container",
        style: "accent",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: "🎫 NEW TICKET",
                    size: "small",
                    weight: "bolder",
                    color: "light",
                  },
                  {
                    type: "TextBlock",
                    text: `#${ticket.ticketNumber || ticket.id}`,
                    size: "extraLarge",
                    weight: "bolder",
                    color: "light",
                    spacing: "none",
                  },
                ],
              },
              {
                type: "Column",
                width: "auto",
                verticalContentAlignment: "center",
                items: [
                  {
                    type: "TextBlock",
                    text: `${priorityEmoji} ${ticket.priority}`,
                    size: "medium",
                    weight: "bolder",
                    color: "light",
                    horizontalAlignment: "right",
                  },
                ],
              },
            ],
          },
        ],
      },
      // Title
      {
        type: "TextBlock",
        text: ticket.title,
        size: "large",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      // Key info in two columns
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "CATEGORY",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: `${categoryEmoji} ${ticket.category}`,
                spacing: "none",
              },
            ],
          },
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "DEPARTMENT",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: formatDepartment(ticket),
                spacing: "none",
                wrap: true,
              },
            ],
          },
        ],
      },
      // Requester and location row
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "REQUESTER",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: `👤 ${ticket.originalRequester || ticket.requester.displayName}`,
                spacing: "none",
                wrap: true,
              },
            ],
          },
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "CREATED",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: `🕐 ${formatCardDate(ticket.created)}`,
                spacing: "none",
              },
            ],
          },
        ],
      },
      // Location if present
      ...(ticket.location ? [
        {
          type: "TextBlock",
          text: `📍 ${ticket.location}`,
          isSubtle: true,
          spacing: "small",
        } as AdaptiveCardElement,
      ] : []),
      // Description section
      {
        type: "Container",
        separator: true,
        spacing: "medium",
        items: [
          {
            type: "TextBlock",
            text: truncatedDescription || "_No description provided_",
            wrap: true,
            isSubtle: true,
            maxLines: 4,
          },
        ],
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "📂 Open Ticket",
        url: `${APP_URL}?ticket=${ticket.id}`,
        style: "positive",
      },
    ],
  };
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "New": return "🆕";
    case "In Progress": return "🔄";
    case "On Hold": return "⏸️";
    case "Resolved": return "✅";
    case "Closed": return "🔒";
    default: return "📋";
  }
}

/**
 * Generate an Adaptive Card for status change notification
 * Clean design showing the status transition
 */
export function generateStatusChangeCard(
  ticket: Ticket,
  oldStatus: string,
  changedByName: string
): AdaptiveCardBody {
  const newStatusEmoji = getStatusEmoji(ticket.status);

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      // Header
      {
        type: "Container",
        style: "emphasis",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: "📊 STATUS UPDATE",
                    size: "small",
                    weight: "bolder",
                  },
                  {
                    type: "TextBlock",
                    text: `#${ticket.ticketNumber || ticket.id}`,
                    size: "large",
                    weight: "bolder",
                    spacing: "none",
                  },
                ],
              },
            ],
          },
        ],
      },
      // Title
      {
        type: "TextBlock",
        text: ticket.title,
        size: "medium",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      // Status transition - prominent display
      {
        type: "Container",
        style: "default",
        spacing: "medium",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: oldStatus,
                    size: "medium",
                    horizontalAlignment: "center",
                    isSubtle: true,
                  },
                ],
              },
              {
                type: "Column",
                width: "auto",
                verticalContentAlignment: "center",
                items: [
                  {
                    type: "TextBlock",
                    text: "➡️",
                    size: "large",
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${newStatusEmoji} ${ticket.status}`,
                    size: "medium",
                    weight: "bolder",
                    horizontalAlignment: "center",
                    color: getStatusColor(ticket.status),
                  },
                ],
              },
            ],
          },
        ],
      },
      // Changed by info
      {
        type: "TextBlock",
        text: `👤 Updated by ${changedByName}`,
        isSubtle: true,
        spacing: "medium",
        size: "small",
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "📂 Open Ticket",
        url: `${APP_URL}?ticket=${ticket.id}`,
        style: "positive",
      },
    ],
  };
}

/**
 * Generate an Adaptive Card for priority escalation notification
 * Attention-grabbing design for escalated tickets
 */
export function generatePriorityEscalationCard(
  ticket: Ticket,
  oldPriority: string,
  changedByName: string
): AdaptiveCardBody {
  const isUrgent = ticket.priority === "Urgent";
  const oldEmoji = getPriorityEmoji(oldPriority);
  const newEmoji = getPriorityEmoji(ticket.priority);

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      // Header with attention-grabbing style
      {
        type: "Container",
        style: isUrgent ? "attention" : "warning",
        bleed: true,
        padding: "default",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "auto",
                verticalContentAlignment: "center",
                items: [
                  {
                    type: "TextBlock",
                    text: isUrgent ? "🚨" : "⚡",
                    size: "extraLarge",
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: isUrgent ? "URGENT ESCALATION" : "PRIORITY ESCALATION",
                    size: "medium",
                    weight: "bolder",
                    color: "light",
                  },
                  {
                    type: "TextBlock",
                    text: `#${ticket.ticketNumber || ticket.id}`,
                    size: "large",
                    weight: "bolder",
                    color: "light",
                    spacing: "none",
                  },
                ],
              },
            ],
          },
        ],
      },
      // Title
      {
        type: "TextBlock",
        text: ticket.title,
        size: "medium",
        weight: "bolder",
        wrap: true,
        spacing: "medium",
      },
      // Priority transition - very prominent
      {
        type: "Container",
        style: "emphasis",
        spacing: "medium",
        padding: "default",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${oldEmoji} ${oldPriority}`,
                    size: "medium",
                    horizontalAlignment: "center",
                  },
                ],
              },
              {
                type: "Column",
                width: "auto",
                verticalContentAlignment: "center",
                items: [
                  {
                    type: "TextBlock",
                    text: "⬆️",
                    size: "large",
                  },
                ],
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: `${newEmoji} ${ticket.priority}`,
                    size: "large",
                    weight: "bolder",
                    horizontalAlignment: "center",
                    color: getPriorityColor(ticket.priority),
                  },
                ],
              },
            ],
          },
        ],
      },
      // Details
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "DEPARTMENT",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: formatDepartment(ticket),
                spacing: "none",
                wrap: true,
              },
            ],
          },
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: "REQUESTER",
                size: "small",
                isSubtle: true,
                weight: "bolder",
              },
              {
                type: "TextBlock",
                text: ticket.originalRequester || ticket.requester.displayName,
                spacing: "none",
                wrap: true,
              },
            ],
          },
        ],
      },
      // Escalated by
      {
        type: "TextBlock",
        text: `⬆️ Escalated by ${changedByName}`,
        isSubtle: true,
        spacing: "medium",
        size: "small",
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "🚀 Open Ticket Now",
        url: `${APP_URL}?ticket=${ticket.id}`,
        style: "positive",
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
  console.log("[Teams Debug] sendNewTicketTeamsNotification called for ticket:", ticket.id);
  console.log("[Teams Debug] TEAMS_NOTIFICATIONS_ENABLED:", TEAMS_NOTIFICATIONS_ENABLED);
  console.log("[Teams Debug] TEAMS_CHANNELS_LIST_ID:", TEAMS_CHANNELS_LIST_ID);

  // Check global kill switch
  if (!TEAMS_NOTIFICATIONS_ENABLED) {
    console.log("[Teams Debug] BLOCKED: Notifications disabled");
    return;
  }

  // Check date filter (skip old/migrated tickets)
  if (!isTicketAfterStartDate(ticket)) {
    console.log("[Teams Debug] BLOCKED: Ticket before start date");
    return;
  }

  console.log("[Teams Debug] Passed initial checks, starting async notification...");

  // Run async without blocking
  (async () => {
    try {
      console.log("[Teams Debug] Fetching channel config...");
      const configs = await fetchTeamsChannelConfig(client);
      console.log("[Teams Debug] Got configs:", configs.length, "channels");
      console.log("[Teams Debug] Looking for department:", ticket.problemType);

      const channelConfig = findChannelForTicket(configs, ticket.problemType);

      if (!channelConfig) {
        console.log(`[Teams Debug] BLOCKED: No Teams channel configured for department: ${ticket.problemType}`);
        console.log("[Teams Debug] Available departments:", configs.map(c => c.department));
        return;
      }

      console.log("[Teams Debug] Found channel:", channelConfig.title);

      if (!shouldNotifyTeams(ticket.priority, channelConfig.minPriority)) {
        console.log(`[Teams Debug] BLOCKED: Ticket priority ${ticket.priority} below threshold ${channelConfig.minPriority}`);
        return;
      }

      console.log("[Teams Debug] Generating card and posting...");
      const card = generateNewTicketCard(ticket);
      await postToTeamsChannel(client, channelConfig.teamId, channelConfig.channelId, card);
      console.log(`[Teams Debug] SUCCESS: Posted to Teams channel: ${channelConfig.title}`);
    } catch (error) {
      console.error("[Teams Debug] ERROR:", error);
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
