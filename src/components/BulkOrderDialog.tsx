"use client";

import { useState } from "react";
import type { QueueRow } from "@/lib/lineItemQueue";
import type { PurchaseLineItem } from "@/types/ticket";

export interface BulkOrderSubmission {
  vendor: string;
  orderNum: string;
  notes?: string;
  // Per-row: index in the rows[] array → optional actual cost / delivery override
  perRow: { actualCost?: number; expectedDelivery?: string }[];
}

interface BulkOrderDialogProps {
  rows: QueueRow[];
  onCancel: () => void;
  onConfirm: (submission: BulkOrderSubmission) => Promise<void>;
}

export default function BulkOrderDialog({ rows, onCancel, onConfirm }: BulkOrderDialogProps) {
  // Pre-fill vendor if all selected rows share one inferred/explicit vendor.
  const distinctVendors = Array.from(new Set(rows.map((r) => r.displayVendor)));
  const initialVendor = distinctVendors.length === 1 ? distinctVendors[0] : "";

  const [vendor, setVendor] = useState(initialVendor);
  const [orderNum, setOrderNum] = useState("");
  const [notes, setNotes] = useState("");
  const [perRow, setPerRow] = useState<{ actualCost?: number; expectedDelivery?: string }[]>(
    rows.map((r) => ({
      actualCost: r.item.actualCost,
      expectedDelivery: r.item.expectedDelivery,
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = vendor.trim().length > 0 && orderNum.trim().length > 0;

  const handleConfirm = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        vendor: vendor.trim(),
        orderNum: orderNum.trim(),
        notes: notes.trim() || undefined,
        perRow,
      });
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Failed to save. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<PurchaseLineItem>) => {
    setPerRow((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const totalEst = rows.reduce((sum, r) => sum + r.item.qty * r.item.cost, 0);
  const totalActual = rows.reduce((sum, r, i) => {
    const c = perRow[i]?.actualCost ?? r.item.cost;
    return sum + r.item.qty * c;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Mark {rows.length} item{rows.length !== 1 ? "s" : ""} as Ordered
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Vendor <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. Amazon"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {distinctVendors.length > 1 && (
                <p className="text-xs text-orange-700 mt-1">
                  Selected items span {distinctVendors.length} vendors —
                  this single value will be applied to all.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Order # <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={orderNum}
                onChange={(e) => setOrderNum(e.target.value)}
                placeholder="Confirmation / order number"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Items in this order</p>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-1.5">Ticket</th>
                    <th className="text-left px-3 py-1.5">Item</th>
                    <th className="text-center px-3 py-1.5">Qty</th>
                    <th className="text-right px-3 py-1.5">Est $/ea</th>
                    <th className="text-right px-3 py-1.5">Actual $/ea</th>
                    <th className="text-left px-3 py-1.5">Delivery</th>
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
                      <td className="text-right px-3 py-1.5">${r.item.cost.toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          value={perRow[i]?.actualCost ?? ""}
                          onChange={(e) =>
                            updateRow(i, {
                              actualCost: e.target.value === "" ? undefined : parseFloat(e.target.value),
                            })
                          }
                          placeholder={r.item.cost.toFixed(2)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={perRow[i]?.expectedDelivery ?? ""}
                          onChange={(e) => updateRow(i, { expectedDelivery: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 text-sm">
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td colSpan={3} className="text-right px-3 py-1.5">
                      Estimated total
                    </td>
                    <td colSpan={3} className="text-right px-3 py-1.5">
                      ${totalEst.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="text-right px-3 py-1.5 text-gray-700">
                      Actual total
                    </td>
                    <td colSpan={3} className="text-right px-3 py-1.5 text-gray-700">
                      ${totalActual.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes (optional, applied to each ticket)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Mark Ordered (${rows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
