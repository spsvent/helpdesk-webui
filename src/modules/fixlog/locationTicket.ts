// "New location" ticket bridge. When IT logs a fix at a place that isn't in the
// shared location list (src/lib/locationConfig.ts — the same list the ticket form
// uses), raise ONE ticket for the location to be added officially.
//
// Ticket-specific helpers are deliberately NOT part of the @/shared/graph facade.
// This file is the Fix Log's single sanctioned deep import into the ticket client
// (the other one is PurchaseForm's convert bridge); keep ticket logic here only.
//
// Per Justin (2026-11-28): "ticket only" — assigned to him, no email and no Teams
// post. It still gets the normal activity-log row and the task-manager syncs every
// assigned Tech ticket gets, so it shows up wherever his tickets do.

import { Client } from "@microsoft/microsoft-graph-client";
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { createTicket, logActivity } from "@/lib/graphClient";
import { syncTicketCreated } from "@/lib/vikunjaSyncService";
import { syncTodoCreated } from "@/lib/todoSyncService";
import { locationTicketTitle } from "./fixLog";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TICKETS_LIST_ID = process.env.NEXT_PUBLIC_TICKETS_LIST_ID || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
// Who adds locations to the official list. Blank = the ticket is created unassigned.
const ASSIGNEE = process.env.NEXT_PUBLIC_FIXLOG_LOCATION_TICKET_ASSIGNEE || "";

export type LocationTicketResult =
  | { kind: "created"; ticketNumber?: number }
  | { kind: "exists"; ticketNumber?: number };

/** An open (not Resolved/Closed) ticket that already asks for this location. */
async function findOpenTicket(client: Client, title: string): Promise<number | undefined | null> {
  const filter = `fields/Title eq '${title.replace(/'/g, "''")}'`;
  let url: string | undefined =
    `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields($select=Title,Status,TicketNumber)&$top=50&$filter=${encodeURIComponent(filter)}`;
  while (url) {
    // Title isn't indexed on Tickets; the header lets the filter run anyway.
    const res: { value?: { id: string; fields?: Record<string, unknown> }[]; "@odata.nextLink"?: string } =
      await client.api(url).header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly").get();
    for (const it of res.value || []) {
      const status = it.fields?.Status as string | undefined;
      if (status !== "Resolved" && status !== "Closed")
        return (it.fields?.TicketNumber as number | undefined) ?? Number(it.id);
    }
    url = res["@odata.nextLink"];
  }
  return null;
}

/**
 * Make sure exactly one open ticket asks for `name` to be added. If the lookup
 * itself fails we still create one: a duplicate ticket is cheaper than a lost request.
 */
export async function ensureLocationTicket(
  client: Client,
  opts: {
    name: string;
    entryId: string;
    requesterEmail: string;
    requesterName: string;
    instance: IPublicClientApplication;
    account: AccountInfo;
  }
): Promise<LocationTicketResult> {
  if (!TICKETS_LIST_ID) throw new Error("Tickets list is not configured");
  const title = locationTicketTitle(opts.name);

  try {
    const existing = await findOpenTicket(client, title);
    if (existing !== null) return { kind: "exists", ticketNumber: existing };
  } catch (e) {
    console.warn("[locationTicket] duplicate check failed; creating anyway:", e);
  }

  const entryLink = APP_URL ? `${APP_URL}/fixlog?id=${opts.entryId}` : `/fixlog?id=${opts.entryId}`;
  const description = [
    `**${opts.requesterName || opts.requesterEmail}** logged a Quick Fix at a location that isn't in the location list:`,
    "",
    `> ${opts.name}`,
    "",
    "If it's a real place, add it to `LOCATION_OPTIONS` in `src/lib/locationConfig.ts` (the same list the ticket form uses), then close this ticket. If it's a misspelling of an existing location, just close it.",
    "",
    `Fix Log entry: ${entryLink}`,
  ].join("\n");

  // Problem (not Request) so it doesn't enter the GM approval workflow.
  const ticket = await createTicket(
    client,
    {
      title,
      description,
      category: "Problem",
      priority: "Low",
      problemType: "Tech",
      problemTypeSub: "HelpDesk",
      problemTypeSub2: "Feature Request",
      location: "Other",
      assigneeEmail: ASSIGNEE || undefined,
    },
    opts.requesterEmail,
    { creatorEmail: opts.requesterEmail, creatorName: opts.requesterName, msalInstance: opts.instance, account: opts.account }
  );

  await logActivity(client, {
    eventType: "ticket_created",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber?.toString(),
    actor: opts.requesterEmail,
    actorName: opts.requesterName,
    description: `Created ticket: ${ticket.title}`,
    details: JSON.stringify({ source: "quick_fix_log", fixLogEntryId: opts.entryId, assignedTo: ASSIGNEE || "Unassigned" }),
  }).catch((e) => console.error("[locationTicket] activity log failed:", e));
  syncTicketCreated(ticket);
  syncTodoCreated(ticket);

  return { kind: "created", ticketNumber: ticket.ticketNumber };
}
