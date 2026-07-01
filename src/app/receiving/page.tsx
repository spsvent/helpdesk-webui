"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import {
  getGraphClient,
  getTickets,
  invalidateTicketsCache,
  bulkUpdateLineItems,
  logActivity,
  BulkLineItemUpdate,
} from "@/lib/graphClient";
import { allItemsReceived } from "@/lib/lineItemHelpers";
import {
  flattenUnreceivedItems,
  flattenRecentlyReceived,
  QueueRow,
} from "@/lib/lineItemQueue";
// Purchase-module requests (PurchaseRequests list) share this queue but write
// back through the module's own service, never the ticket update path.
import {
  listPurchases,
  bulkUpdateLineItems as bulkUpdatePurchaseItems,
  BulkLineItemUpdate as PurchaseBulkUpdate,
} from "@/modules/purchase/purchaseService";
import { allItemsReceived as allPurchaseItemsReceived } from "@/modules/purchase/lineItems";
import { purchaseUnreceivedRows, purchaseRecentlyReceivedRows } from "@/modules/purchase/queueRows";
import type { PurchaseRequest } from "@/modules/purchase/types";
import { useRBAC } from "@/contexts/RBACContext";
import LineItemQueue from "@/components/LineItemQueue";
import BulkReceiveDialog, { BulkReceiveSubmission } from "@/components/BulkReceiveDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { Ticket, PurchaseLineItem } from "@/types/ticket";

export default function ReceivingPage() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions, loading: rbacLoading } = useRBAC();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogRows, setDialogRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!accounts[0]) return;
    setLoading(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const [list, prs] = await Promise.all([getTickets(client), listPurchases(client)]);
      setTickets(list);
      setPurchases(prs);
    } catch (e) {
      console.error("Failed to load tickets for receiving queue:", e);
      setError("Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    if (isAuthenticated && accounts[0]) fetchAll();
  }, [isAuthenticated, accounts, fetchAll]);

  useEffect(() => {
    if (!rbacLoading && permissions && !permissions.isInventory) {
      router.replace("/");
    }
  }, [rbacLoading, permissions, router]);

  const handleBulkConfirm = async (rows: QueueRow[], submission: BulkReceiveSubmission) => {
    if (!accounts[0]) return;
    const client = getGraphClient(instance, accounts[0]);
    const receiverEmail = accounts[0].username;
    const receiverName = accounts[0].name || accounts[0].username;

    // Ticket rows and purchase-module rows are grouped separately — each writes
    // back to its own list — but rowOrder keeps the OVERALL index so
    // submission.perRow lines up across both.
    const byTicket = new Map<string, { rows: QueueRow[]; rowOrder: number[] }>();
    const byPurchase = new Map<string, { rows: QueueRow[]; rowOrder: number[] }>();
    rows.forEach((r, i) => {
      const map = r.source === "purchase" ? byPurchase : byTicket;
      const entry = map.get(r.ticketId) ?? { rows: [], rowOrder: [] };
      entry.rows.push(r);
      entry.rowOrder.push(i);
      map.set(r.ticketId, entry);
    });

    const updates: BulkLineItemUpdate[] = [];
    Array.from(byTicket.entries()).forEach(([ticketId, entry]) => {
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) return;
      const original = ticket.purchaseLineItems ?? [];
      const newItems: PurchaseLineItem[] = original.map((it) => ({ ...it }));
      entry.rows.forEach((r: QueueRow, i: number) => {
        const overall = entry.rowOrder[i];
        const perRow = submission.perRow[overall];
        newItems[r.itemIndex] = {
          ...newItems[r.itemIndex],
          receivedQty: perRow?.receivedQty,
          receivedDate: perRow?.receivedDate,
        };
      });
      const allReceived = allItemsReceived(newItems);
      updates.push({
        ticketId,
        lineItems: newItems,
        purchaseStatus: allReceived ? "Received" : ticket.purchaseStatus ?? "Ordered",
        notes: submission.notes,
      });
    });

    // Purchase-module rows: same mutation, written to the PurchaseRequests list.
    const prUpdates: PurchaseBulkUpdate[] = [];
    Array.from(byPurchase.entries()).forEach(([prId, entry]) => {
      const pr = purchases.find((p) => p.id === prId);
      if (!pr) return;
      const newItems = pr.lineItems.map((it) => ({ ...it }));
      entry.rows.forEach((r: QueueRow, i: number) => {
        const overall = entry.rowOrder[i];
        const perRow = submission.perRow[overall];
        newItems[r.itemIndex] = {
          ...newItems[r.itemIndex],
          receivedQty: perRow?.receivedQty,
          receivedDate: perRow?.receivedDate,
        };
      });
      prUpdates.push({
        id: prId,
        lineItems: newItems,
        purchaseStatus: allPurchaseItemsReceived(newItems) ? "Received" : pr.purchaseStatus,
        notes: submission.notes,
      });
    });

    const [results, prResults] = await Promise.all([
      bulkUpdateLineItems(client, updates),
      bulkUpdatePurchaseItems(client, prUpdates),
    ]);
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const prFailed = prResults.filter((r) => !r.ok);

    for (const result of succeeded) {
      const ticketId = result.ticketId;
      const ticket = tickets.find((t) => t.id === ticketId);
      const entry = byTicket.get(ticketId);
      if (!ticket || !entry) continue;
      logActivity(client, {
        eventType: "purchase_received",
        ticketId,
        ticketNumber: ticket.ticketNumber?.toString() || ticketId,
        actor: receiverEmail,
        actorName: receiverName,
        description: `Bulk-received ${entry.rows.length} item${
          entry.rows.length === 1 ? "" : "s"
        }`,
        details: JSON.stringify({
          itemCount: entry.rows.length,
          itemIndexes: entry.rows.map((r) => r.itemIndex),
        }),
      }).catch((e) => console.error("Failed to log bulk-received:", e));
    }

    invalidateTicketsCache();

    if (failed.length > 0 || prFailed.length > 0) {
      const failures = [
        ...failed.map((f) => `#${f.ticketId} (${f.error})`),
        ...prFailed.map((f) => `PR ${f.id} (${f.error})`),
      ];
      const savedCount = succeeded.length + prResults.filter((r) => r.ok).length;
      const msg = `Saved ${savedCount} of ${results.length + prResults.length} requests. ${failures.length} failed: ${failures.join(", ")}`;
      throw new Error(msg);
    }

    setDialogRows(null);
    await fetchAll();
  };

  if (!isAuthenticated || rbacLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading…" size="large" />
      </div>
    );
  }

  if (permissions && !permissions.isInventory) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        Redirecting…
      </div>
    );
  }

  const awaitingRows = [...flattenUnreceivedItems(tickets), ...purchaseUnreceivedRows(purchases)];
  const recentRows = [...flattenRecentlyReceived(tickets, 30), ...purchaseRecentlyReceivedRows(purchases, 30)];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
            ← Tickets
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">Receiving Queue</h1>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="text-sm text-text-secondary hover:text-text-primary p-1.5 rounded transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg
            className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </header>

      <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded mb-4">
            {error}
          </div>
        )}
        <LineItemQueue
          mode="receive"
          awaitingRows={awaitingRows}
          recentRows={recentRows}
          loading={loading}
          onBulkAction={(selected) => setDialogRows(selected)}
        />
      </main>

      {dialogRows && (
        <BulkReceiveDialog
          rows={dialogRows}
          onCancel={() => setDialogRows(null)}
          onConfirm={(submission) => handleBulkConfirm(dialogRows, submission)}
        />
      )}
    </div>
  );
}
