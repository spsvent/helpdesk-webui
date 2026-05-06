"use client";

import { useState } from "react";
import type { QueueRow } from "@/lib/lineItemQueue";

export interface BulkReceiveSubmission {
  notes?: string;
  perRow: { receivedQty?: number; receivedDate?: string }[];
}

interface BulkReceiveDialogProps {
  rows: QueueRow[];
  onCancel: () => void;
  onConfirm: (submission: BulkReceiveSubmission) => Promise<void>;
}

export default function BulkReceiveDialog({ rows, onCancel, onConfirm }: BulkReceiveDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [perRow, setPerRow] = useState<{ receivedQty?: number; receivedDate?: string }[]>(
    rows.map((r) => ({
      receivedQty: r.item.qty,
      receivedDate: today,
    })),
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    rows.length > 0 &&
    perRow.every((p) => Boolean(p.receivedDate) && (p.receivedQty ?? 0) > 0);

  const markAllToday = () => {
    setPerRow(
      rows.map((r) => ({
        receivedQty: r.item.qty,
        receivedDate: today,
      })),
    );
  };

  const updateRow = (idx: number, patch: { receivedQty?: number; receivedDate?: string }) => {
    setPerRow((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ notes: notes.trim() || undefined, perRow });
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Failed to save. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Mark {rows.length} item{rows.length !== 1 ? "s" : ""} as Received
          </h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">
              Defaults to full quantity received today. Adjust per row for partial receipts.
            </p>
            <button
              type="button"
              onClick={markAllToday}
              className="text-xs text-emerald-700 hover:underline"
            >
              Reset all to today / full qty
            </button>
          </div>

          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-1.5">Ticket</th>
                  <th className="text-left px-3 py-1.5">Item</th>
                  <th className="text-center px-3 py-1.5">Ordered</th>
                  <th className="text-center px-3 py-1.5">Received Qty</th>
                  <th className="text-left px-3 py-1.5">Received Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ticketId}-${r.itemIndex}`} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-xs text-gray-600">
                      #{r.ticketNumber ?? r.ticketId}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.item.name || r.item.url || `Item ${r.itemIndex + 1}`}
                    </td>
                    <td className="text-center px-3 py-1.5">{r.item.qty}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={perRow[i]?.receivedQty ?? ""}
                        onChange={(e) =>
                          updateRow(i, {
                            receivedQty:
                              e.target.value === ""
                                ? undefined
                                : Math.max(0, parseInt(e.target.value, 10)),
                          })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="date"
                        value={perRow[i]?.receivedDate ?? ""}
                        onChange={(e) => updateRow(i, { receivedDate: e.target.value })}
                        className="px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes (optional, applied to each ticket)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condition notes, discrepancies, etc..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="px-4 py-2 text-sm rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Mark Received (${rows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
