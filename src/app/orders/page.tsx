"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { QueueRow } from "@/lib/lineItemQueue";
// Order queue reads exclusively from the PurchaseRequests list and writes back
// through the purchase module's own service (purchases were extracted from the
// ticket flow — see src/modules/purchase/).
import {
  listPurchases,
  bulkUpdateLineItems as bulkUpdatePurchaseItems,
  BulkLineItemUpdate as PurchaseBulkUpdate,
} from "@/modules/purchase/purchaseService";
import { allItemsOrdered as allPurchaseItemsOrdered } from "@/modules/purchase/lineItems";
import { purchaseUnorderedRows, purchaseRecentlyOrderedRows } from "@/modules/purchase/queueRows";
import type { PurchaseRequest } from "@/modules/purchase/types";
import { useRBAC } from "@/contexts/RBACContext";
import LineItemQueue from "@/components/LineItemQueue";
import BulkOrderDialog, { BulkOrderSubmission } from "@/components/BulkOrderDialog";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function OrdersPage() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions, loading: rbacLoading } = useRBAC();

  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogRows, setDialogRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!accounts[0]) return;
    setLoading(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      setPurchases(await listPurchases(client));
    } catch (e) {
      console.error("Failed to load purchase requests for orders queue:", e);
      setError("Failed to load purchase requests.");
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

    // Group selected rows by parent request, build each new lineItems array
    // (preserve unselected items, mutate selected ones with vendor/orderNum/…),
    // then write back to the PurchaseRequests list. rowOrder keeps the overall
    // index so submission.perRow lines up.
    const byPurchase = new Map<string, { rows: QueueRow[]; rowOrder: number[] }>();
    rows.forEach((r, i) => {
      const entry = byPurchase.get(r.ticketId) ?? { rows: [], rowOrder: [] };
      entry.rows.push(r);
      entry.rowOrder.push(i);
      byPurchase.set(r.ticketId, entry);
    });

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
          vendor: submission.vendor,
          orderNum: submission.orderNum,
          actualCost: perRow?.actualCost,
          expectedDelivery: perRow?.expectedDelivery,
        };
      });
      prUpdates.push({
        id: prId,
        lineItems: newItems,
        purchaseStatus: allPurchaseItemsOrdered(newItems) ? "Ordered" : pr.purchaseStatus,
        notes: submission.notes,
      });
    });

    const prResults = await bulkUpdatePurchaseItems(client, prUpdates);
    const prFailed = prResults.filter((r) => !r.ok);

    if (prFailed.length > 0) {
      const failures = prFailed.map((f) => `PR ${f.id} (${f.error})`);
      const savedCount = prResults.filter((r) => r.ok).length;
      throw new Error(
        `Saved ${savedCount} of ${prResults.length} requests. ${failures.length} failed: ${failures.join(", ")}`
      );
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

  const awaitingRows = purchaseUnorderedRows(purchases);
  const recentRows = purchaseRecentlyOrderedRows(purchases, 30);

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
