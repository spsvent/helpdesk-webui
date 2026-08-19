// Safety net for approved-but-unassigned Request tickets.
//
// The normal flow assigns a ticket (and emails the assignee group) at creation
// via the AutoAssign rules. If a ticket slips through unassigned — e.g. its
// department had no rule when it was created, or the rules list was unreachable —
// an approval would otherwise land in a void: the decision email only goes to the
// requester/participants, so the team meant to do the work never hears about it
// (see tickets #577/#578). This runs the same rules again at approval time.

import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import { updateTicketFields, addAssignmentComment, logActivity } from "@/lib/graphClient";
import { sendAssignmentEmail } from "@/lib/emailService";
import { getSuggestedAssigneeWithGroup } from "@/lib/autoAssignConfig";
import { fetchAutoAssignConfig, getSuggestedAssigneeFromConfig } from "@/lib/autoAssignConfigService";

/** Display name for a (possibly group) assignee email: "itav@…" → "Itav". */
function assigneeDisplayName(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * If the ticket has no assignee, resolve one from the AutoAssign rules (SharePoint
 * list first, hardcoded fallback second — same order as the create form), persist
 * it, notify it, and leave the usual assignment comment + activity-log trail.
 *
 * Returns the assignee email when an assignment was made, null otherwise.
 * Never throws — a failure here must not break the approval itself.
 */
export async function autoAssignIfUnassigned(
  client: Client,
  ticket: Ticket,
  actorName: string
): Promise<string | null> {
  if (ticket.assignedTo?.email || ticket.originalAssignedTo) return null;

  try {
    let assigneeEmail: string | null = null;
    const config = await fetchAutoAssignConfig(client).catch(() => null);
    if (config && config.rules.length > 0) {
      assigneeEmail = getSuggestedAssigneeFromConfig(
        config,
        ticket.problemType,
        ticket.problemTypeSub || undefined,
        ticket.problemTypeSub2 || undefined,
        ticket.category,
        ticket.priority
      );
    }
    if (!assigneeEmail) {
      assigneeEmail =
        getSuggestedAssigneeWithGroup(
          ticket.problemType,
          ticket.problemTypeSub || undefined,
          ticket.problemTypeSub2 || undefined,
          ticket.category,
          ticket.priority
        )?.email || null;
    }
    if (!assigneeEmail) return null;

    await updateTicketFields(client, ticket.id, { OriginalAssignedTo: assigneeEmail });
    const assigneeName = assigneeDisplayName(assigneeEmail);

    // Notification + trail are best-effort: the assignment itself already saved.
    await Promise.all([
      sendAssignmentEmail(client, ticket, assigneeEmail, assigneeName, actorName).catch((e) =>
        console.error("[approvalSafetyNet] assignment email failed:", e)
      ),
      addAssignmentComment(client, parseInt(ticket.id), "System", assigneeName, assigneeEmail).catch((e) =>
        console.error("[approvalSafetyNet] assignment comment failed:", e)
      ),
      logActivity(client, {
        eventType: "ticket_assigned",
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
        actor: "system",
        actorName: "System",
        description: `Auto-assigned to ${assigneeName} on approval (was unassigned)`,
        details: JSON.stringify({ to: assigneeEmail, trigger: "approval_safety_net" }),
      }).catch((e) => console.error("[approvalSafetyNet] activity log failed:", e)),
    ]);

    return assigneeEmail;
  } catch (e) {
    console.error("[approvalSafetyNet] auto-assign on approval failed:", e);
    return null;
  }
}
