// Big-bang migration runner (admin action). COPY-ONLY + idempotent: reads purchase
// tickets from the Tickets list and creates matching records in the PurchaseRequests
// list. It NEVER modifies or deletes the source tickets — those stay intact as the
// rollback backup until we've confirmed the new module works. Re-running is safe:
// tickets already copied (a PR carrying their sourceTicketId) are skipped.

import { Client } from "@microsoft/microsoft-graph-client";
import { SharePointListItem, SharePointListResponse } from "@/shared/spTypes";
import { createPurchase, listPurchases } from "./purchaseService";
import { mapTicketItemToPurchase } from "./migration";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TICKETS_LIST_ID = process.env.NEXT_PUBLIC_TICKETS_LIST_ID || "";

export interface MigrationItem {
  sourceTicketNumber?: number;
  sourceTicketId: string;
  title: string;
  action: "created" | "would-create" | "skipped" | "error";
  error?: string;
}

export interface MigrationReport {
  dryRun: boolean;
  totalPurchaseTickets: number;
  alreadyMigrated: number;
  created: number;
  errors: number;
  items: MigrationItem[];
}

async function fetchPurchaseTickets(client: Client): Promise<SharePointListItem[]> {
  // IsPurchaseRequest isn't indexed; fetch and filter client-side (mirrors
  // getPendingApprovalsCount). Paginate to be safe on large lists.
  const items: SharePointListItem[] = [];
  let url = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=2000`;
  for (;;) {
    const res: SharePointListResponse = await client.api(url).get();
    items.push(...(res.value || []));
    const next = res["@odata.nextLink"];
    if (!next) break;
    url = next;
  }
  return items.filter((i) => (i.fields as Record<string, unknown>).IsPurchaseRequest === true);
}

export async function runPurchaseMigration(
  client: Client,
  opts: { dryRun: boolean }
): Promise<MigrationReport> {
  const dryRun = opts.dryRun;

  // Already-migrated source ticket ids (idempotency).
  const existing = await listPurchases(client);
  const migrated = new Set(existing.map((p) => p.sourceTicketId).filter(Boolean) as string[]);

  const tickets = await fetchPurchaseTickets(client);
  const report: MigrationReport = {
    dryRun,
    totalPurchaseTickets: tickets.length,
    alreadyMigrated: 0,
    created: 0,
    errors: 0,
    items: [],
  };

  for (const item of tickets) {
    const input = mapTicketItemToPurchase(item);
    const sid = input.sourceTicketId || item.id;
    const base = { sourceTicketNumber: input.sourceTicketNumber, sourceTicketId: sid, title: input.title || "" };

    if (migrated.has(sid)) {
      report.alreadyMigrated++;
      report.items.push({ ...base, action: "skipped" });
      continue;
    }
    if (dryRun) {
      report.items.push({ ...base, action: "would-create" });
      continue;
    }
    try {
      await createPurchase(client, input);
      migrated.add(sid);
      report.created++;
      report.items.push({ ...base, action: "created" });
    } catch (e) {
      report.errors++;
      report.items.push({ ...base, action: "error", error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return report;
}
