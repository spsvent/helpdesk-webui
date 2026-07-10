"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { PurchaseRequest } from "../types";
import { purchaseRequiresReason } from "../access";
import { cancelPurchase } from "../purchaseService";
import { notifyPurchaseCancelled } from "../purchaseEmail";

// Cancel a purchase request at any live point in the flow. A reason is required
// once the request has been ordered (Ordered/Purchased/Received); optional before.
export default function CancelPurchasePanel({
  pr,
  onCancelled,
}: {
  pr: PurchaseRequest;
  onCancelled: (pr: PurchaseRequest) => void;
}) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonRequired = purchaseRequiresReason(pr.purchaseStatus);

  async function confirm() {
    if (!account) return;
    if (reasonRequired && !reason.trim()) {
      setError("A reason is required to cancel a request that has already been ordered.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const client = getGraphClient(instance, account);
      const actor = { name: account.name || account.username || "", email: account.username || "" };
      const updated = await cancelPurchase(client, pr.id, actor, reason.trim() || undefined);
      // Best-effort: don't block the UI update on the email fan-out.
      notifyPurchaseCancelled(client, updated, actor.name, actor.email, reason.trim() || undefined);
      onCancelled(updated);
    } catch (e) {
      console.error("[CancelPurchasePanel] cancel failed:", e);
      setError(e instanceof Error ? e.message : "Could not cancel the request. Please try again.");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-bg-card text-red-700 text-sm rounded-lg font-medium border border-red-300 hover:bg-red-50"
      >
        Cancel request
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">Cancel this purchase request?</p>
      <p className="mt-1 text-xs text-red-700">
        This marks the request Cancelled and takes it out of the order/receive queues.
        {reasonRequired
          ? " This request has already been ordered, so a reason is required."
          : " Adding a reason is optional."}
      </p>
      <label htmlFor="cancel-reason" className="mt-3 block text-sm font-medium text-text-primary">
        Reason {reasonRequired && <span className="text-red-500">*</span>}
      </label>
      <textarea
        id="cancel-reason"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this being cancelled?"
        className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? "Cancelling…" : "Cancel request"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setReason(""); setError(null); }}
          disabled={submitting}
          className="px-4 py-2 bg-bg-card text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40 disabled:opacity-50"
        >
          Keep request
        </button>
      </div>
    </div>
  );
}
