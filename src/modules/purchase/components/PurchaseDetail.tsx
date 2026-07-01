"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ResendApprovalButton from "@/components/ResendApprovalButton";
import { PurchaseLineItem, PurchaseRequest } from "../types";
import {
  getPurchase,
  submitForApproval,
  triggerPurchaseApprovalRequest,
  updateLineItems,
  visiblePurchase,
} from "../purchaseService";
import { canApprovePurchase, canEditPurchase, canPurchase, canReceive, isPurchaseEditable } from "../access";
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
  const [submitting, setSubmitting] = useState(false);
  // Non-fatal: the resubmit saved but the approver email didn't go out.
  const [emailWarning, setEmailWarning] = useState(false);
  // The approval panel hit a concurrent decision (email link / another GM).
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

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

  // Put a bounced ("Changes Requested") or never-submitted request back into the
  // approval queue: status → Pending + a fresh approver email.
  async function handleResubmit() {
    if (!account || !pr) return;
    // Guard: an itemless request can't enter the GM approval queue.
    if (pr.lineItems.length === 0) {
      setError("Add at least one item (edit the request) before submitting for approval.");
      return;
    }
    setError(null);
    setEmailWarning(false);
    setSubmitting(true);
    try {
      const client = getGraphClient(instance, account);
      const { purchase, emailSent } = await submitForApproval(client, pr.id, pr.requesterName);
      setPr(purchase);
      setEmailWarning(!emailSent);
    } catch (e) {
      console.error("[PurchaseDetail] resubmit failed:", e);
      setError("Could not submit for approval. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
  // Owner edit/resubmit escape hatch (mirrors CdwDetail): only while the request
  // is out of the approval gate — "Changes Requested" or never submitted.
  const canEdit = canEditPurchase(pr, permissions) && isPurchaseEditable(pr);

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

      {conflictNotice && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{conflictNotice}</p>
        </div>
      )}

      {canApprovePurchase(permissions) && pr.approvalStatus === "Pending" && (
        <div className="mt-4">
          <PurchaseApprovalPanel
            pr={pr}
            onDecided={setPr}
            onConflict={(msg) => {
              // Show what happened, then reload so the stale panel is replaced by
              // the real (decided) state.
              setConflictNotice(msg);
              load();
            }}
          />
        </div>
      )}

      {pr.approvalStatus === "Pending" && (
        <div className="mt-4">
          {emailWarning && (
            <p className="mb-2 text-sm text-amber-600">
              Submitted — but the approval email could not be sent. Use “Re-send approval request” below.
            </p>
          )}
          <ResendApprovalButton
            onSend={() => triggerPurchaseApprovalRequest(pr.id, pr.requesterName || pr.createdByName)}
          />
        </div>
      )}

      {canEdit && (
        <div className="mt-4 rounded-lg border border-border bg-bg-subtle p-4">
          <p className="text-sm text-text-primary">
            {pr.approvalStatus === "Changes Requested"
              ? `Changes were requested${pr.approvedByName ? ` by ${pr.approvedByName}` : ""}. Edit the request, then resubmit for approval.`
              : "This request hasn’t been submitted. Edit or submit it for approval when ready."}
          </p>
          {pr.approvalStatus === "Changes Requested" && pr.approvalNotes && (
            <p className="mt-1 text-sm text-text-secondary">“{pr.approvalNotes}”</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/purchase/edit/?id=${pr.id}`}
              className="px-4 py-2 bg-bg-card text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40"
            >
              Edit request
            </Link>
            <button
              type="button"
              onClick={handleResubmit}
              disabled={submitting}
              className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
            >
              {submitting ? "Submitting…" : pr.approvalStatus === "Changes Requested" ? "Resubmit for Approval" : "Submit for Approval"}
            </button>
          </div>
        </div>
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
