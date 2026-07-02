"use client";

import { useState, useEffect } from "react";
import { PurchaseLineItem } from "../types";
import { loadDraft, clearDraft } from "@/lib/formDraft";

interface ReceiveActionPanelProps {
  pr: { id: string; lineItems: PurchaseLineItem[] };
  onMarkReceived: (receivedItems: PurchaseLineItem[], notes?: string) => Promise<void>;
}

export default function ReceiveActionPanel({ pr, onMarkReceived }: ReceiveActionPanelProps) {
  const today = new Date().toISOString().split("T")[0];
  const [isExpanded, setIsExpanded] = useState(false);
  // Pre-seed each row from existing data: 0/empty if never received, or last saved values
  const [receivedItems, setReceivedItems] = useState<PurchaseLineItem[]>(() =>
    (pr.lineItems ?? []).map((it) => ({
      ...it,
      receivedQty: it.receivedQty ?? 0,      // 0 = not received yet
      receivedDate: it.receivedDate ?? "",   // empty = not received yet
    })),
  );
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a receive draft snapshotted before a renewal redirect, then clear it (one-shot).
  useEffect(() => {
    const d = loadDraft<{ receivedItems?: PurchaseLineItem[]; notes?: string }>(`receive:${pr.id}`);
    if (d) {
      if (d.receivedItems) setReceivedItems(d.receivedItems);
      if (typeof d.notes === "string") setNotes(d.notes);
      clearDraft(`receive:${pr.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valid if at least one item has both a received date and qty > 0
  const isValid =
    receivedItems.length > 0 &&
    receivedItems.some((item) => Boolean(item.receivedDate) && (item.receivedQty ?? 0) > 0);

  const markAllReceivedToday = () => {
    setReceivedItems((items) =>
      items.map((it) => ({
        ...it,
        receivedQty: it.qty,
        receivedDate: today,
      })),
    );
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onMarkReceived(receivedItems, notes.trim() || undefined);
      setIsExpanded(false);
      setNotes("");
    } catch (error) {
      console.error("Failed to mark as received:", error);
      setError("Could not save the receipt. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        Mark as Received
      </button>
    );
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-emerald-900">Receiving Details (per item)</h4>
        <button
          type="button"
          onClick={markAllReceivedToday}
          className="text-xs text-emerald-700 hover:underline"
        >
          Mark all received today
        </button>
      </div>

      {receivedItems.length === 0 && (
        <p className="text-sm text-emerald-700">No line items on this ticket.</p>
      )}

      {receivedItems.map((item, idx) => (
        <div key={idx} className="bg-white border border-emerald-200 rounded p-2 space-y-1">
          <div className="text-sm">
            <strong>{idx + 1}. {item.name || item.url || `Item ${idx + 1}`}</strong>
            <span className="text-emerald-700"> — ordered ×{item.qty}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <label className="block text-xs text-emerald-700 mb-1">Received Qty</label>
              <input
                type="number"
                value={item.receivedQty ?? ""}
                onChange={(e) => {
                  const updated = [...receivedItems];
                  updated[idx] = {
                    ...updated[idx],
                    receivedQty: e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value, 10)),
                  };
                  setReceivedItems(updated);
                }}
                min={0}
                step={1}
                className="w-full px-2 py-1 border border-emerald-300 rounded text-sm"
                aria-label={`Received quantity for item ${idx + 1}`}
              />
            </div>
            <div>
              <label className="block text-xs text-emerald-700 mb-1">Received Date</label>
              <input
                type="date"
                value={item.receivedDate ?? ""}
                onChange={(e) => {
                  const updated = [...receivedItems];
                  updated[idx] = { ...updated[idx], receivedDate: e.target.value };
                  setReceivedItems(updated);
                }}
                className="w-full px-2 py-1 border border-emerald-300 rounded text-sm"
                aria-label={`Received date for item ${idx + 1}`}
              />
            </div>
          </div>
        </div>
      ))}

      <div>
        <label className="block text-xs text-emerald-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Condition notes, discrepancies, etc..."
          rows={2}
          className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : "Save Receipt"}
        </button>
        <button
          onClick={() => setIsExpanded(false)}
          disabled={isSubmitting}
          className="px-4 py-2 bg-white border border-emerald-300 text-emerald-700 text-sm rounded-lg font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
