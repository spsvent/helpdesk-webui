import { Ticket } from "@/types/ticket";

// Azure Function URL for Vikunja sync
const VIKUNJA_SYNC_FUNCTION_URL = process.env.NEXT_PUBLIC_VIKUNJA_SYNC_FUNCTION_URL || "";

// Global kill switch - defaults to DISABLED
const VIKUNJA_SYNC_ENABLED = process.env.NEXT_PUBLIC_VIKUNJA_SYNC_ENABLED === "true";

/**
 * Check if a ticket should sync to Vikunja.
 * Only Tech department tickets are synced.
 */
function shouldSync(ticket: Ticket): boolean {
  if (!VIKUNJA_SYNC_ENABLED) return false;
  if (!VIKUNJA_SYNC_FUNCTION_URL) return false;
  return ticket.problemType === "Tech";
}

/**
 * Fire-and-forget POST to the sync Azure Function.
 * Errors are logged but never thrown to the caller.
 */
function fireSync(payload: Record<string, unknown>): void {
  (async () => {
    try {
      const response = await fetch(VIKUNJA_SYNC_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Vikunja sync failed:", errorData.error || response.status);
      }
    } catch (error) {
      console.error("Vikunja sync request failed:", error);
    }
  })();
}

/**
 * Sync a newly created ticket to Vikunja.
 * Creates a task in the configured Vikunja project.
 * Fire-and-forget — errors are logged but don't block ticket creation.
 */
export function syncTicketCreated(ticket: Ticket): void {
  if (!shouldSync(ticket)) return;

  fireSync({
    eventType: "ticket_created",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    requesterName: ticket.originalRequester || ticket.requester.displayName,
    requesterEmail: ticket.requester.email,
    assigneeName: ticket.assignedTo?.displayName,
    assigneeEmail: ticket.assignedTo?.email,
  });
}

/**
 * Sync ticket field changes to Vikunja.
 * Updates the corresponding Vikunja task with changed fields.
 * Fire-and-forget — errors are logged but don't block ticket update.
 */
export function syncTicketUpdated(
  ticket: Ticket,
  changedFields: {
    status?: { old: string; new: string };
    priority?: { old: string; new: string };
    assignee?: { old: string; new: string };
  },
  actorName: string,
  actorEmail: string
): void {
  if (!shouldSync(ticket)) return;

  // Determine the event type — resolved tickets get special handling
  const isResolved = changedFields.status?.new === "Resolved" || changedFields.status?.new === "Closed";

  fireSync({
    eventType: isResolved ? "ticket_resolved" : "ticket_updated",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
    changedFields,
    actorName,
    actorEmail,
  });
}

/**
 * Notify the sync backend that a ticket has been recategorized away from Tech.
 * The backend pauses the SyncMap so the webhook won't resolve or mirror this ticket anymore.
 * Fire-and-forget — errors are logged but don't block the save.
 *
 * Unlike the other sync helpers, this bypasses shouldSync() because the new problemType
 * is (by definition) no longer Tech.
 */
export function syncTicketRecategorized(
  ticketId: string,
  oldProblemType: string,
  newProblemType: string
): void {
  if (!VIKUNJA_SYNC_ENABLED) return;
  if (!VIKUNJA_SYNC_FUNCTION_URL) return;
  if (oldProblemType !== "Tech") return; // Only care about leaving Tech
  if (newProblemType === "Tech") return; // No-op if it's still Tech

  fireSync({
    eventType: "ticket_recategorized",
    ticketId,
    oldProblemType,
    newProblemType,
  });
}

/**
 * Sync a comment added to a ticket to Vikunja.
 * Creates a comment on the corresponding Vikunja task.
 * Fire-and-forget — errors are logged but don't block comment posting.
 *
 * Skips internal comments and comments that were synced FROM Vikunja
 * (to prevent infinite sync loops).
 */
export function syncCommentAdded(
  ticket: Ticket,
  text: string,
  isInternal: boolean,
  actorName: string,
  actorEmail: string
): void {
  if (!shouldSync(ticket)) return;

  // Don't sync internal/private comments
  if (isInternal) return;

  // Don't sync comments that originated from Vikunja (loop prevention)
  if (text.includes("[Synced from Vikunja]")) return;

  fireSync({
    eventType: "comment_added",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    text: `[Synced from Help Desk] ${actorName}:\n${text}`,
    actorName,
    actorEmail,
  });
}
