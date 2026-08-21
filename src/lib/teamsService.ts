import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import {
  TeamsChannelConfig,
  TeamsMinPriority,
  PRIORITY_ORDER,
  AdaptiveCardBody,
  AdaptiveCardElement,
  AdaptiveCardAction,
  mapToTeamsChannelConfig,
  TeamsChannelSharePointItem,
} from "@/types/teams";

// SharePoint site and list IDs
const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TEAMS_CHANNELS_LIST_ID = process.env.NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID || "";

// App URL for card action buttons
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lively-coast-062dfc51e.1.azurestaticapps.net";

// Azure Function URL for Teams notifications (uses bot for proactive messaging)
const TEAMS_FUNCTION_URL = process.env.NEXT_PUBLIC_TEAMS_FUNCTION_URL || "";

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
 * Find the Teams channel configuration for a ticket's department hierarchy
 * Matching priority (most specific to least specific):
 * 1. Exact match on department + subDepartment + problemType
 * 2. Match on department + subDepartment (no problemType filter)
 * 3. Match on department only (no subDepartment or problemType filter)
 */
export function findChannelForTicket(
  configs: TeamsChannelConfig[],
  department: string,
  subDepartment?: string,
  problemType?: string
): TeamsChannelConfig | null {
  // Priority 1: Exact match (department + subDepartment + problemType)
  if (subDepartment && problemType) {
    const exactMatch = configs.find(
      (config) =>
        config.isActive &&
        config.department.toLowerCase() === department.toLowerCase() &&
        config.subDepartment?.toLowerCase() === subDepartment.toLowerCase() &&
        config.problemType?.toLowerCase() === problemType.toLowerCase()
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Priority 2: Department + subDepartment match (accepts all problemTypes)
  if (subDepartment) {
    const subDeptMatch = configs.find(
      (config) =>
        config.isActive &&
        config.department.toLowerCase() === department.toLowerCase() &&
        config.subDepartment?.toLowerCase() === subDepartment.toLowerCase() &&
        !config.problemType // Only match channels that accept all problemTypes
    );
    if (subDeptMatch) {
      return subDeptMatch;
    }
  }

  // Priority 3: Department-only match (accepts all sub-departments and problemTypes)
  return configs.find(
    (config) =>
      config.isActive &&
      config.department.toLowerCase() === department.toLowerCase() &&
      !config.subDepartment && // Only match channels that accept all sub-departments
      !config.problemType
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
//
// Design goal: these cards are read in a busy Teams channel, so every line has
// to earn its height. One headline line (number + priority + category + time),
// the title, one subtle meta line (route, location, people), and the
// description — no emphasis header bar, no LABEL/value column grids.

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
 * Format a date as a bare day (no time) - used for due dates
 */
function formatCardDay(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

/**
 * Join meta fragments with a middot, dropping any that are empty.
 */
function joinMeta(parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/**
 * The headline (first) line of every card: bold ticket number followed by the
 * at-a-glance signals. Colored + bolded for High/Urgent so those cards stand
 * out in a scrolling channel.
 */
function buildHeadline(ticket: Ticket, parts: string[]): AdaptiveCardElement {
  const escalated = ticket.priority === "High" || ticket.priority === "Urgent";
  return {
    type: "TextBlock",
    text: joinMeta([`**#${ticket.ticketNumber || ticket.id}**`, ...parts]),
    size: "small",
    weight: escalated ? "bolder" : "default",
    color: getPriorityColor(ticket.priority),
    isSubtle: !escalated,
    wrap: true,
    spacing: "none",
  };
}

/**
 * The ticket title - the one element that gets real visual weight.
 */
function buildTitle(ticket: Ticket): AdaptiveCardElement {
  return {
    type: "TextBlock",
    text: ticket.title,
    size: "medium",
    weight: "bolder",
    wrap: true,
    spacing: "small",
  };
}

/**
 * The single subtle meta line: routing + location + who's involved. Replaces
 * the old six-cell LABEL/value grid (~8 lines of card) with one wrapping line.
 * Extra fragments (e.g. "by Jane") are appended by the caller.
 */
function buildMetaLine(ticket: Ticket, extra: string[] = []): AdaptiveCardElement {
  return {
    type: "TextBlock",
    text: joinMeta([
      formatDepartment(ticket),
      ticket.location && `📍 ${ticket.location}`,
      `👤 ${ticket.originalRequester || ticket.requester.displayName}`,
      ticket.assignedTo?.displayName
        ? `🛠️ ${ticket.assignedTo.displayName}`
        : "⚠️ Unassigned",
      ticket.dueDate && `🗓️ Due ${formatCardDay(ticket.dueDate)}`,
      ...extra,
    ]),
    size: "small",
    isSubtle: true,
    wrap: true,
    spacing: "small",
  };
}

/**
 * Description, capped so a wall-of-text ticket can't take over the channel.
 */
function buildDescription(ticket: Ticket): AdaptiveCardElement {
  const text = (ticket.description || "").trim();
  return {
    type: "TextBlock",
    text: text.length > 280 ? `${text.substring(0, 280)}…` : text || "_No description provided_",
    wrap: true,
    maxLines: 3,
    spacing: "small",
  };
}

/**
 * Best email we have for the requester (migrated tickets store it as a string).
 */
function getRequesterEmail(ticket: Ticket): string {
  const original = ticket.originalRequester || "";
  if (original.includes("@")) return original;
  return ticket.requester.email || "";
}

/**
 * Card actions: open the ticket, plus one-tap ways to reach the requester so
 * work can start from the card instead of from a lookup.
 */
function buildCardActions(ticket: Ticket): AdaptiveCardAction[] {
  const actions: AdaptiveCardAction[] = [
    {
      type: "Action.OpenUrl",
      title: "Open Ticket",
      url: `${APP_URL}?ticket=${ticket.id}`,
      style: "positive",
    },
  ];

  const email = getRequesterEmail(ticket);
  if (email) {
    const subject = encodeURIComponent(
      `Ticket #${ticket.ticketNumber || ticket.id}: ${ticket.title}`
    );
    actions.push({
      type: "Action.OpenUrl",
      title: "Email",
      url: `mailto:${email}?subject=${subject}`,
    });
    actions.push({
      type: "Action.OpenUrl",
      title: "Chat",
      url: `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`,
    });
  }

  return actions;
}

/**
 * Generate an Adaptive Card for a new ticket notification
 */
export function generateNewTicketCard(ticket: Ticket): AdaptiveCardBody {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      buildHeadline(ticket, [
        `${getPriorityEmoji(ticket.priority)} ${ticket.priority}`,
        `${getCategoryEmoji(ticket.category)} ${ticket.category}`,
        formatCardDate(ticket.created),
      ]),
      buildTitle(ticket),
      buildMetaLine(ticket),
      buildDescription(ticket),
    ],
    actions: buildCardActions(ticket),
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
        type: "TextBlock",
        text: joinMeta([
          `**#${ticket.ticketNumber || ticket.id}**`,
          `${oldStatus} → **${getStatusEmoji(ticket.status)} ${ticket.status}**`,
          `${getPriorityEmoji(ticket.priority)} ${ticket.priority}`,
          formatCardDate(ticket.modified),
        ]),
        size: "small",
        color: getStatusColor(ticket.status),
        wrap: true,
        spacing: "none",
      },
      buildTitle(ticket),
      buildMetaLine(ticket, [`by ${changedByName}`]),
      buildDescription(ticket),
    ],
    actions: buildCardActions(ticket),
  };
}

/**
 * Generate an Adaptive Card for priority escalation notification
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
        type: "TextBlock",
        text: joinMeta([
          isUrgent ? "🔺 **URGENT**" : "🔺 **ESCALATED**",
          `**#${ticket.ticketNumber || ticket.id}**`,
          `${getPriorityEmoji(oldPriority)} ${oldPriority} → **${getPriorityEmoji(ticket.priority)} ${ticket.priority}**`,
          `${getCategoryEmoji(ticket.category)} ${ticket.category}`,
        ]),
        size: "small",
        weight: "bolder",
        color: isUrgent ? "attention" : "warning",
        wrap: true,
        spacing: "none",
      },
      buildTitle(ticket),
      buildMetaLine(ticket, [`by ${changedByName}`]),
      buildDescription(ticket),
    ],
    actions: buildCardActions(ticket),
  };
}

// ============================================
// Graph API - Post to Teams Channel
// ============================================

/**
 * Post an Adaptive Card message to a Teams channel
 */
export async function postToTeamsChannel(
  _client: Client,
  teamId: string,
  channelId: string,
  card: AdaptiveCardBody
): Promise<void> {
  // Use Azure Function with Bot Framework for proactive messaging
  // This doesn't require the user to be a member of the team
  if (!TEAMS_FUNCTION_URL) {
    console.error("NEXT_PUBLIC_TEAMS_FUNCTION_URL not configured");
    return;
  }

  const response = await fetch(TEAMS_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      teamId,
      channelId,
      card,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Teams notification failed: ${response.status}`);
  }
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
  ticket: Ticket,
  options?: { force?: boolean }
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
      const channelConfig = findChannelForTicket(configs, ticket.problemType, ticket.problemTypeSub, ticket.problemTypeSub2);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}${ticket.problemTypeSub ? ` > ${ticket.problemTypeSub}` : ""}`);
        return;
      }

      if (!shouldNotifyTeams(ticket.priority, channelConfig.minPriority)) {
        return;
      }

      const card = generateNewTicketCard(ticket);
      await postToTeamsChannel(client, channelConfig.teamId, channelConfig.channelId, card);
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
      const channelConfig = findChannelForTicket(configs, ticket.problemType, ticket.problemTypeSub, ticket.problemTypeSub2);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}${ticket.problemTypeSub ? ` > ${ticket.problemTypeSub}` : ""}`);
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
      const channelConfig = findChannelForTicket(configs, ticket.problemType, ticket.problemTypeSub, ticket.problemTypeSub2);

      if (!channelConfig) {
        console.log(`No Teams channel configured for department: ${ticket.problemType}${ticket.problemTypeSub ? ` > ${ticket.problemTypeSub}` : ""}`);
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
