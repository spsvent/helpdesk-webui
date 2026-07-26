import { Ticket } from "@/types/ticket";

// Azure Function URL for Microsoft To Do sync
const TODO_SYNC_FUNCTION_URL = process.env.NEXT_PUBLIC_TODO_SYNC_FUNCTION_URL || "";

// Global kill switch — defaults to DISABLED
const TODO_SYNC_ENABLED = process.env.NEXT_PUBLIC_TODO_SYNC_ENABLED === "true";

/** The email a ticket is currently assigned to (Person lookup, else legacy text field). */
function assigneeEmailOf(ticket: Ticket): string {
  return ticket.assignedTo?.email || ticket.originalAssignedTo || "";
}

function baseEnabled(): boolean {
  return TODO_SYNC_ENABLED && !!TODO_SYNC_FUNCTION_URL;
}

/**
 * Whether a brand-new ticket should create a To Do task.
 * Scope: Tech department tickets that already have an assignee.
 */
function shouldCreate(ticket: Ticket): boolean {
  return baseEnabled() && ticket.problemType === "Tech" && !!assigneeEmailOf(ticket);
}

/**
 * Whether ticket changes should reach the To Do backend.
 * Any Tech ticket qualifies — the backend upserts (create-on-assign),
 * completes on resolve, and pauses on unassign.
 */
function shouldTrack(ticket: Ticket): boolean {
  return baseEnabled() && ticket.problemType === "Tech";
}

/**
 * Fire-and-forget POST to the sync Azure Function.
 * Errors are logged but never thrown to the caller.
 */
function fireSync(payload: Record<string, unknown>): void {
  (async () => {
    try {
      const response = await fetch(TODO_SYNC_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("To Do sync failed:", errorData.error || response.status);
      }
    } catch (error) {
      console.error("To Do sync request failed:", error);
    }
  })();
}

/**
 * Sync a newly created ticket to Microsoft To Do.
 * Creates a task in the configured To Do list. Fire-and-forget.
 */
export function syncTodoCreated(ticket: Ticket): void {
  if (!shouldCreate(ticket)) return;

  fireSync({
    eventType: "ticket_created",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
    problemType: ticket.problemType,
    requesterName: ticket.originalRequester || ticket.requester.displayName,
    assigneeEmail: assigneeEmailOf(ticket),
    assigneeName: ticket.assignedTo?.displayName,
    dueDate: ticket.dueDate,
  });
}

/**
 * Sync ticket field changes to Microsoft To Do.
 * The backend keeps the task's title/importance in sync, checks it off when the
 * ticket is Resolved/Closed, and reopens it if the ticket is reopened.
 * Fire-and-forget.
 */
export function syncTodoUpdated(
  ticket: Ticket,
  changedFields: Record<string, { old: string; new: string }>,
  actorName: string,
  actorEmail: string
): void {
  if (!shouldTrack(ticket)) return;

  fireSync({
    eventType: "ticket_updated",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
    problemType: ticket.problemType,
    assigneeEmail: assigneeEmailOf(ticket),
    assigneeName: ticket.assignedTo?.displayName,
    dueDate: ticket.dueDate,
    changedFields,
    actorName,
    actorEmail,
  });
}

/**
 * Notify the sync backend that a ticket has been recategorized away from Tech.
 * The backend checks off the To Do task and pauses the mapping.
 * Bypasses shouldTrack() because the new problemType is (by definition) no longer Tech.
 */
export function syncTodoRecategorized(
  ticketId: string,
  oldProblemType: string,
  newProblemType: string
): void {
  if (!baseEnabled()) return;
  if (oldProblemType !== "Tech") return; // Only care about leaving Tech
  if (newProblemType === "Tech") return; // No-op if it's still Tech

  fireSync({
    eventType: "ticket_recategorized",
    ticketId,
    oldProblemType,
    newProblemType,
  });
}
