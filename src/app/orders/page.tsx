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
import { allItemsOrdered } from "@/lib/lineItemHelpers";
import {
  flattenUnorderedItems,
  flattenRecentlyOrdered,
  QueueRow,
} from "@/lib/lineItemQueue";
import { useRBAC } from "@/contexts/RBACContext";
import LineItemQueue from "@/components/LineItemQueue";
import BulkOrderDialog, { BulkOrderSubmission } from "@/components/BulkOrderDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { Ticket, PurchaseLineItem } from "@/types/ticket";

export default function OrdersPage() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions, loading: rbacLoading } = useRBAC();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogRows, setDialogRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!accounts[0]) return;
    setLoading(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const list = await getTickets(client);
      setTickets(list);
    } catch (e) {
      console.error("Failed to load tickets for orders queue:", e);
      setError("Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    if (isAuthenticated && accounts[0]) fetchAll();
  }, [isAuthenticated, accounts, fetchAll]);

  // Route guard: redirect non-purchasers to home.
  useEffect(() => {
    if (!rbacLoading && permissions && !permissions.isPurchaser) {
      router.replace("/");
    }
  }, [rbacLoading, permissions, router]);

  const handleBulkConfirm = async (rows: QueueRow[], submission: BulkOrderSubmission) => {
    if (!accounts[0]) return;
    const client = getGraphClient(instance, accounts[0]);
    const purchaserEmail = accounts[0].username;
    const purchaserName = accounts[0].name || accounts[0].username;

    // Group selected rows by ticket. For each ticket build the new
    // lineItems array (preserve unselected items as-is, mutate the
    // selected ones with vendor/orderNum/actualCost/expectedDelivery).
    const byTicket = new Map<string, { rows: QueueRow[]; rowOrder: number[] }>();
    rows.forEach((r, i) => {
      const entry = byTicket.get(r.ticketId) ?? { rows: [], rowOrder: [] };
      entry.rows.push(r);
      entry.rowOrder.push(i);
      byTicket.set(r.ticketId, entry);
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
          vendor: submission.vendor,
          orderNum: submission.orderNum,
          actualCost: perRow?.actualCost,
          expectedDelivery: perRow?.expectedDelivery,
        };
      });
      const allOrdered = allItemsOrdered(newItems);
      updates.push({
        ticketId,
        lineItems: newItems,
        purchaseStatus: allOrdered ? "Ordered" : ticket.purchaseStatus ?? "Approved",
        notes: submission.notes,
      });
    });

    const results = await bulkUpdateLineItems(client, updates);
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Per-ticket activity log entries — only for the ones that saved.
    for (const result of succeeded) {
      const ticketId = result.ticketId;
      const ticket = tickets.find((t) => t.id === ticketId);
      const entry = byTicket.get(ticketId);
      if (!ticket || !entry) continue;
      logActivity(client, {
        eventType: "purchase_ordered",
        ticketId,
        ticketNumber: ticket.ticketNumber?.toString() || ticketId,
        actor: purchaserEmail,
        actorName: purchaserName,
        description: `Bulk-ordered ${entry.rows.length} item${
          entry.rows.length === 1 ? "" : "s"
        } from ${submission.vendor} (${submission.orderNum})`,
        details: JSON.stringify({
          vendor: submission.vendor,
          orderNum: submission.orderNum,
          itemCount: entry.rows.length,
          itemIndexes: entry.rows.map((r) => r.itemIndex),
        }),
      }).catch((e) => console.error("Failed to log bulk-ordered:", e));
    }

    invalidateTicketsCache();

    if (failed.length > 0) {
      const msg = `Saved ${succeeded.length} of ${results.length} tickets. ${failed.length} failed: ${failed
        .map((f) => `#${f.ticketId} (${f.error})`)
        .join(", ")}`;
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

  if (permissions && !permissions.isPurchaser) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        Redirecting…
      </div>
    );
  }

  const awaitingRows = flattenUnorderedItems(tickets);
  const recentRows = flattenRecentlyOrdered(tickets, 30);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
            ← Tickets
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">Order Queue</h1>
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
          mode="order"
          awaitingRows={awaitingRows}
          recentRows={recentRows}
          loading={loading}
          onBulkAction={(selected) => setDialogRows(selected)}
        />
      </main>

      {dialogRows && (
        <BulkOrderDialog
          rows={dialogRows}
          onCancel={() => setDialogRows(null)}
          onConfirm={(submission) => handleBulkConfirm(dialogRows, submission)}
        />
      )}
    </div>
  );
}
