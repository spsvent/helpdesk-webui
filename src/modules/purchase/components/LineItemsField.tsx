// src/components/LineItemsField.tsx
"use client";

import { PurchaseLineItem } from "../types";
import { computeEstimatedTotal } from "../lineItems";

interface LineItemsFieldProps {
  items: PurchaseLineItem[];
  onChange: (items: PurchaseLineItem[]) => void;
  showOrderFields?: boolean;       // also show vendor/orderNum/actualCost/expectedDelivery (Purchaser flow)
}

const EMPTY_ROW: PurchaseLineItem = { qty: 1, cost: 0 };

export default function LineItemsField({ items, onChange, showOrderFields = false }: LineItemsFieldProps) {
  const ensureAtLeastOne = items.length === 0 ? [EMPTY_ROW] : items;
  const total = computeEstimatedTotal(ensureAtLeastOne);

  const updateRow = (index: number, patch: Partial<PurchaseLineItem>) => {
    const next = ensureAtLeastOne.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const removeRow = (index: number) => {
    if (ensureAtLeastOne.length <= 1) return; // keep at least one
    onChange(ensureAtLeastOne.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...ensureAtLeastOne, { ...EMPTY_ROW }]);
  };

  return (
    <div className="space-y-2">
      {ensureAtLeastOne.map((item, idx) => (
        <div
          key={idx}
          className="bg-white border border-amber-300 rounded p-2 flex flex-wrap items-center gap-2"
        >
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold">
            {idx + 1}
          </span>
          <input
            type="text"
            value={item.name ?? ""}
            onChange={(e) => updateRow(idx, { name: e.target.value })}
            placeholder="Item name"
            className="flex-[2_2_140px] min-w-[140px] px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <input
            type="url"
            value={item.url ?? ""}
            onChange={(e) => updateRow(idx, { url: e.target.value })}
            placeholder="https://... (optional if name given)"
            className="flex-[3_3_180px] min-w-[160px] px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <input
            type="number"
            value={item.qty}
            onChange={(e) => updateRow(idx, { qty: Math.max(1, parseInt(e.target.value || "1", 10)) })}
            min={1}
            step={1}
            className="w-16 px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Quantity"
          />
          <div className="relative">
            <span className="absolute left-2 top-1.5 text-sm text-amber-600">$</span>
            <input
              type="number"
              value={item.cost}
              onChange={(e) => updateRow(idx, { cost: Math.max(0, parseFloat(e.target.value || "0")) })}
              min={0}
              step={0.01}
              className="w-24 pl-5 pr-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Cost per item"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            disabled={ensureAtLeastOne.length <= 1}
            className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={`Remove item ${idx + 1}`}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full px-3 py-2 bg-amber-200 text-amber-900 text-sm font-semibold rounded hover:bg-amber-300 transition-colors"
      >
        + Add Another Item
      </button>

      <div className="flex justify-end items-center gap-2 px-2 py-1 bg-amber-100 rounded">
        <span className="text-xs font-medium text-amber-800">Estimated Total:</span>
        <span className="text-sm font-bold text-amber-900">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
