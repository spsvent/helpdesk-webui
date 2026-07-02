"use client";

import { useState, useEffect } from "react";
import { Ticket, PurchaseLineItem } from "@/types/ticket";
import { loadDraft, clearDraft } from "@/lib/formDraft";

interface PurchaseActionPanelProps {
  ticket: Ticket;
  onMarkPurchased: (orderItems: PurchaseLineItem[], notes?: string) => Promise<void>;
}

export default function PurchaseActionPanel({ ticket, onMarkPurchased }: PurchaseActionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [orderItems, setOrderItems] = useState<PurchaseLineItem[]>(ticket.purchaseLineItems ?? []);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an order draft snapshotted before a renewal redirect, then clear it (one-shot).
  // Re-expand the panel so the restored order details are visible.
  useEffect(() => {
    const d = loadDraft<{ orderItems?: PurchaseLineItem[]; notes?: string }>(`purchase:${ticket.id}`);
    if (d) {
      if (d.orderItems) setOrderItems(d.orderItems);
      if (typeof d.notes === "string") setNotes(d.notes);
      setIsExpanded(true);
      clearDraft(`purchase:${ticket.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValid =
    orderItems.length > 0 &&
    orderItems.every((item) => Boolean(item.vendor?.trim() && item.orderNum?.trim()));

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onMarkPurchased(orderItems, notes.trim() || undefined);
      setIsExpanded(false);
      setOrderItems(ticket.purchaseLineItems ?? []);
      setNotes("");
    } catch (error) {
      console.error("Failed to mark as purchased:", error);
      setError("Could not save the order details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        Mark as Purchased
      </button>
    );
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-indigo-900">Order Details (per item)</h4>

      {orderItems.length === 0 && (
        <p className="text-sm text-indigo-700">No line items on this ticket.</p>
      )}

      {orderItems.map((item, idx) => (
        <div key={idx} className="bg-white border border-indigo-200 rounded p-2 space-y-1">
          <div className="text-sm">
            <strong>{idx + 1}. {item.name || item.url || `Item ${idx + 1}`} × {item.qty}</strong>
            <span className="text-indigo-600"> — est ${(item.qty * item.cost).toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <input
              type="text"
              placeholder="Vendor *"
              value={item.vendor ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], vendor: e.target.value };
                setOrderItems(updated);
              }}
              className="px-2 py-1 border border-indigo-300 rounded text-sm"
              aria-label={`Vendor for item ${idx + 1}`}
            />
            <input
              type="text"
              placeholder="Order # *"
              value={item.orderNum ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], orderNum: e.target.value };
                setOrderItems(updated);
              }}
              className="px-2 py-1 border border-indigo-300 rounded text-sm"
              aria-label={`Order number for item ${idx + 1}`}
            />
            <input
              type="number"
              placeholder={`Actual $/ea (est $${item.cost.toFixed(2)})`}
              value={item.actualCost ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], actualCost: e.target.value === "" ? undefined : parseFloat(e.target.value) };
                setOrderItems(updated);
              }}
              step={0.01}
              min={0}
              className="px-2 py-1 border border-indigo-300 rounded text-sm"
              aria-label={`Actual cost for item ${idx + 1}`}
            />
            <input
              type="date"
              value={item.expectedDelivery ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], expectedDelivery: e.target.value };
                setOrderItems(updated);
              }}
              className="px-2 py-1 border border-indigo-300 rounded text-sm"
              aria-label={`Expected delivery for item ${idx + 1}`}
            />
          </div>
        </div>
      ))}

      <div>
        <label className="block text-xs text-indigo-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes..."
          rows={2}
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : "Mark as Purchased"}
        </button>
        <button
          onClick={() => setIsExpanded(false)}
          disabled={isSubmitting}
          className="px-4 py-2 bg-white border border-indigo-300 text-indigo-700 text-sm rounded-lg font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
