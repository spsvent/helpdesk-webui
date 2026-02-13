"use client";

import { useState } from "react";

interface ReceiveActionPanelProps {
  onMarkReceived: (data: {
    receivedDate: string;
    notes?: string;
  }) => Promise<void>;
}

export default function ReceiveActionPanel({ onMarkReceived }: ReceiveActionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0] // Default to today
  );
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!receivedDate) return;

    setIsSubmitting(true);
    try {
      await onMarkReceived({
        receivedDate,
        notes: notes.trim() || undefined,
      });
      setIsExpanded(false);
      setNotes("");
    } catch (error) {
      console.error("Failed to mark as received:", error);
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
      <h4 className="text-sm font-medium text-emerald-900">Receiving Details</h4>

      <div>
        <label className="block text-xs text-emerald-700 mb-1">Received Date *</label>
        <input
          type="date"
          value={receivedDate}
          onChange={(e) => setReceivedDate(e.target.value)}
          className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

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

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!receivedDate || isSubmitting}
          className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : "Mark as Received"}
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
