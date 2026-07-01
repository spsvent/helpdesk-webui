// src/components/LineItemsTable.tsx
"use client";

import { PurchaseLineItem } from "../types";
import { computeEstimatedTotal, computeActualTotal, isSafeItemUrl } from "../lineItems";

interface LineItemsTableProps {
  items: PurchaseLineItem[];
  showOrderColumns?: boolean;     // vendor / orderNum / actualCost / expectedDelivery
  showReceivedColumns?: boolean;  // receivedQty / receivedDate
  compact?: boolean;              // smaller padding / fonts (for approval banner)
}

export default function LineItemsTable({
  items,
  showOrderColumns = false,
  showReceivedColumns = false,
  compact = false,
}: LineItemsTableProps) {
  if (items.length === 0) return null;

  const padding = compact ? "px-2 py-1" : "px-3 py-2";
  const fontSize = compact ? "text-xs" : "text-sm";
  const estTotal = computeEstimatedTotal(items);
  const actTotal = computeActualTotal(items);
  const hasActuals = items.some((i) => i.actualCost != null);

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${fontSize} border-collapse`}>
        <thead>
          <tr className="bg-gray-50 text-text-secondary">
            <th className={`text-left ${padding}`}>Item</th>
            <th className={`text-center ${padding}`}>Qty</th>
            <th className={`text-right ${padding}`}>$/ea</th>
            <th className={`text-right ${padding}`}>Subtotal</th>
            {showOrderColumns && (
              <>
                <th className={`text-left ${padding}`}>Vendor</th>
                <th className={`text-left ${padding}`}>Order #</th>
                <th className={`text-right ${padding}`}>Actual $/ea</th>
                <th className={`text-left ${padding}`}>Delivery</th>
              </>
            )}
            {showReceivedColumns && (
              <>
                <th className={`text-center ${padding}`}>Received</th>
                <th className={`text-left ${padding}`}>On</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-t border-border">
              <td className={padding}>
                {item.name ? <strong>{item.name}</strong> : null}
                {item.name && item.url ? <span className="text-text-secondary"> · </span> : null}
                {/* Belt-and-braces: validation rejects non-http(s) URLs at entry, but
                    items saved before that check (or hand-edited in SharePoint) could
                    still carry e.g. javascript: — never render those as an href. */}
                {item.url && isSafeItemUrl(item.url) ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                    link
                  </a>
                ) : null}
              </td>
              <td className={`text-center ${padding}`}>{item.qty}</td>
              <td className={`text-right ${padding}`}>${item.cost.toFixed(2)}</td>
              <td className={`text-right ${padding}`}>${(item.qty * item.cost).toFixed(2)}</td>
              {showOrderColumns && (
                <>
                  <td className={padding}>{item.vendor ?? "—"}</td>
                  <td className={padding}>{item.orderNum ?? "—"}</td>
                  <td className={`text-right ${padding}`}>{item.actualCost != null ? `$${item.actualCost.toFixed(2)}` : "—"}</td>
                  <td className={padding}>{item.expectedDelivery ?? "—"}</td>
                </>
              )}
              {showReceivedColumns && (
                <>
                  <td className={`text-center ${padding}`}>
                    {item.receivedQty != null ? `${item.receivedQty} / ${item.qty}` : "—"}
                  </td>
                  <td className={padding}>{item.receivedDate ?? "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td colSpan={3} className={`text-right ${padding}`}>Estimated Total</td>
            <td className={`text-right ${padding}`}>${estTotal.toFixed(2)}</td>
            {showOrderColumns && <td colSpan={4} />}
            {showReceivedColumns && <td colSpan={2} />}
          </tr>
          {hasActuals && (
            <tr className="border-t border-border font-semibold">
              <td colSpan={3} className={`text-right ${padding}`}>Actual Total</td>
              <td className={`text-right ${padding}`}>${actTotal.toFixed(2)}</td>
              {showOrderColumns && <td colSpan={4} />}
              {showReceivedColumns && <td colSpan={2} />}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
