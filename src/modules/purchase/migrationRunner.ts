// Big-bang migration runner (admin action). COPY-ONLY + idempotent: reads purchase
// tickets from the Tickets list and creates matching records in the PurchaseRequests
// list. It NEVER modifies or deletes the source tickets — those stay intact as the
// rollback backup until we've confirmed the new module works. Re-running is safe:
// tickets already copied (a PR carrying their sourceTicketId) are skipped.

import { Client } from "@microsoft/microsoft-graph-client";
import { SharePointListItem } from "@/shared/spTypes";
import { fetchAllListItems } from "@/shared/listItems";
import { createPurchase, getPurchaseFields, listPurchases } from "./purchaseService";
import { mapTicketItemToPurchase, verifyMigration } from "./migration";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TICKETS_LIST_ID = process.env.NEXT_PUBLIC_TICKETS_LIST_ID || "";

export interface MigrationItem {
  sourceTicketNumber?: number;
  sourceTicketId: string;
  title: string;
  action: "created" | "created-with-warnings" | "would-create" | "skipped" | "error";
  error?: string;
  // Per-item verification mismatches (verifyMigration) — the record WAS created,
  // but its copy doesn't faithfully reflect the source ticket.
  warnings?: string[];
}

export interface MigrationReport {
  dryRun: boolean;
  totalPurchaseTickets: number;
  alreadyMigrated: number;
  created: number;
  warnings: number;
  errors: number;
  items: MigrationItem[];
}

async function fetchPurchaseTickets(client: Client): Promise<SharePointListItem[]> {
  // IsPurchaseRequest isn't indexed; fetch and filter client-side (mirrors
  // getPendingApprovalsCount). Paginated to be safe on large lists.
  const items = await fetchAllListItems(
    client,
    `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=2000`
  );
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
    warnings: 0,
    errors: 0,
    items: [],
  };

  for (const item of tickets) {
    const input = mapTicketItemToPurchase(item);
    const sid = input.sourceTicketId || item.id;
    const base = { sourceTicketNumber: input.sourceTicketNumber ?? undefined, sourceTicketId: sid, title: input.title || "" };

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
      const created = await createPurchase(client, input);
      migrated.add(sid);
      report.created++;
      // Verify the copy against its source (per-item verification report). A
      // mismatch is a warning, not an error — the record exists, but should be
      // eyeballed before the source tickets are retired.
      const problems = verifyMigration(input, await getPurchaseFields(client, created.id));
      if (problems.length > 0) {
        report.warnings++;
        report.items.push({ ...base, action: "created-with-warnings", warnings: problems });
      } else {
        report.items.push({ ...base, action: "created" });
      }
    } catch (e) {
      report.errors++;
      report.items.push({ ...base, action: "error", error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return report;
}
