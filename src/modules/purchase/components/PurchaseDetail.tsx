"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PurchaseLineItem, PurchaseRequest } from "../types";
import { getPurchase, updateLineItems, visiblePurchase } from "../purchaseService";
import { canApprovePurchase, canPurchase, canReceive } from "../access";
import { allItemsOrdered, allItemsReceived } from "../lineItems";
import PurchaseStatusBadge from "./PurchaseStatusBadge";
import LineItemsTable from "./LineItemsTable";
import PurchaseApprovalPanel from "./PurchaseApprovalPanel";
import PurchaseActionPanel from "./PurchaseActionPanel";
import ReceiveActionPanel from "./ReceiveActionPanel";

export default function PurchaseDetail({ id }: { id: string }) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions } = useRBAC();

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const client = getGraphClient(instance, account);
      setPr(await getPurchase(client, id));
    } catch (e) {
      console.error("[PurchaseDetail] load failed:", e);
      setError("Could not load this request.");
    } finally {
      setLoading(false);
    }
  }, [account, instance, id]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkPurchased(orderItems: PurchaseLineItem[], notes?: string) {
    if (!account || !pr) return;
    const client = getGraphClient(instance, account);
    const status = allItemsOrdered(orderItems) ? "Ordered" : pr.purchaseStatus;
    setPr(await updateLineItems(client, pr.id, orderItems, { purchaseStatus: status, notes }));
  }
  async function handleMarkReceived(receivedItems: PurchaseLineItem[], notes?: string) {
    if (!account || !pr) return;
    const client = getGraphClient(instance, account);
    const status = allItemsReceived(receivedItems) ? "Received" : pr.purchaseStatus;
    setPr(await updateLineItems(client, pr.id, receivedItems, { purchaseStatus: status, notes }));
  }

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;
  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!pr) return <p className="p-8 text-sm text-text-secondary">Request not found.</p>;
  if (!visiblePurchase(pr, permissions)) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-sm text-text-secondary">This purchase request isn’t available to you.</p>
        <Link href="/purchase" className="mt-3 inline-block text-sm text-brand-primary underline">Back</Link>
      </div>
    );
  }

  const showOrder = ["Ordered", "Purchased", "Received"].includes(pr.purchaseStatus);
  const showReceived = ["Received"].includes(pr.purchaseStatus) || pr.lineItems.some((i) => i.receivedDate);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link href="/purchase" className="text-sm text-text-secondary hover:text-text-primary">← Purchase requests</Link>
        <PurchaseStatusBadge status={pr.purchaseStatus} />
      </div>

      <h1 className="mt-3 text-xl font-semibold text-text-primary">{pr.title}</h1>
      <p className="mt-1 text-xs text-text-secondary">
        Requested by {pr.requesterName || pr.createdByName || "—"}
        {pr.sourceTicketNumber ? ` · migrated from ticket #${pr.sourceTicketNumber}` : ""}
      </p>

      {canApprovePurchase(permissions) && pr.approvalStatus === "Pending" && (
        <div className="mt-4"><PurchaseApprovalPanel pr={pr} onDecided={setPr} /></div>
      )}

      {(pr.approvalStatus === "Approved" || pr.approvalStatus === "Denied") && pr.approvedByName && (
        <div className="mt-4 rounded-lg border border-border p-4 text-sm">
          <p><span className="font-medium">{pr.approvalStatus}</span> by {pr.approvedByName}{pr.approvalDate ? ` on ${pr.approvalDate}` : ""}</p>
          {pr.approvalNotes && <p className="mt-1 text-text-secondary">“{pr.approvalNotes}”</p>}
        </div>
      )}

      <div className="mt-6">
        <LineItemsTable items={pr.lineItems} showOrderColumns={showOrder} showReceivedColumns={showReceived} />
      </div>

      <dl className="mt-6 divide-y divide-border border-t border-border">
        {pr.justification && (
          <div className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-1">
            <dt className="text-sm font-medium text-text-secondary">Justification</dt>
            <dd className="sm:col-span-2 text-sm text-text-primary whitespace-pre-wrap">{pr.justification}</dd>
          </div>
        )}
        {pr.project && (
          <div className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-1">
            <dt className="text-sm font-medium text-text-secondary">Project</dt>
            <dd className="sm:col-span-2 text-sm text-text-primary">{pr.project}</dd>
          </div>
        )}
      </dl>

      {canPurchase(pr, permissions) && (
        <div className="mt-6"><PurchaseActionPanel pr={pr} onMarkPurchased={handleMarkPurchased} /></div>
      )}
      {canReceive(pr, permissions) && (
        <div className="mt-4"><ReceiveActionPanel pr={pr} onMarkReceived={handleMarkReceived} /></div>
      )}
    </div>
  );
}
