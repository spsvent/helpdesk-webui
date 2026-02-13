"use client";

import { useState } from "react";

interface PurchaseActionPanelProps {
  onMarkPurchased: (data: {
    vendor: string;
    confirmationNum: string;
    actualCost: number;
    expectedDelivery: string;
    notes?: string;
  }) => Promise<void>;
}

export default function PurchaseActionPanel({ onMarkPurchased }: PurchaseActionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [vendor, setVendor] = useState("");
  const [confirmationNum, setConfirmationNum] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = vendor.trim() && confirmationNum.trim() && actualCost && expectedDelivery;

  const handleSubmit = async () => {
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await onMarkPurchased({
        vendor: vendor.trim(),
        confirmationNum: confirmationNum.trim(),
        actualCost: parseFloat(actualCost),
        expectedDelivery,
        notes: notes.trim() || undefined,
      });
      // Reset form on success
      setIsExpanded(false);
      setVendor("");
      setConfirmationNum("");
      setActualCost("");
      setExpectedDelivery("");
      setNotes("");
    } catch (error) {
      console.error("Failed to mark as purchased:", error);
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
      <h4 className="text-sm font-medium text-indigo-900">Purchase Details</h4>

      <div>
        <label className="block text-xs text-indigo-700 mb-1">Vendor *</label>
        <input
          type="text"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Vendor name"
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-indigo-700 mb-1">Order Confirmation # *</label>
        <input
          type="text"
          value={confirmationNum}
          onChange={(e) => setConfirmationNum(e.target.value)}
          placeholder="Confirmation number"
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-indigo-700 mb-1">Actual Cost *</label>
        <input
          type="number"
          value={actualCost}
          onChange={(e) => setActualCost(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-indigo-700 mb-1">Expected Delivery *</label>
        <input
          type="date"
          value={expectedDelivery}
          onChange={(e) => setExpectedDelivery(e.target.value)}
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

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
