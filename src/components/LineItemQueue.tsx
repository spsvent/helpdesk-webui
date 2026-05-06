"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { QueueRow } from "@/lib/lineItemQueue";
import { groupByVendor } from "@/lib/lineItemQueue";

type Tab = "awaiting" | "recent";
type SortKey = "vendor" | "ticket" | "cost";

interface LineItemQueueProps {
  mode: "order" | "receive";
  awaitingRows: QueueRow[];
  recentRows: QueueRow[];
  onBulkAction: (selected: QueueRow[]) => void;
  loading?: boolean;
}

function rowKey(r: QueueRow): string {
  return `${r.ticketId}-${r.itemIndex}`;
}

export default function LineItemQueue({
  mode,
  awaitingRows,
  recentRows,
  onBulkAction,
  loading = false,
}: LineItemQueueProps) {
  const [tab, setTab] = useState<Tab>("awaiting");
  const [sortKey, setSortKey] = useState<SortKey>("vendor");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = tab === "awaiting" ? awaitingRows : recentRows;
  const isRecent = tab === "recent";

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "vendor") return a.displayVendor.localeCompare(b.displayVendor);
      if (sortKey === "ticket") return (a.ticketNumber ?? 0) - (b.ticketNumber ?? 0);
      return b.item.qty * b.item.cost - a.item.qty * a.item.cost;
    });
    return copy;
  }, [rows, sortKey]);

  const groups = useMemo(
    () => (sortKey === "vendor" ? groupByVendor(sortedRows) : null),
    [sortKey, sortedRows],
  );

  const allKeys = sortedRows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === allKeys.length) return new Set();
      return new Set(allKeys);
    });
  };

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectVendorGroup = (groupRows: QueueRow[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = groupRows.map(rowKey);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const selectedRows = sortedRows.filter((r) => selected.has(rowKey(r)));
  const distinctTickets = new Set(selectedRows.map((r) => r.ticketId)).size;

  const bulkLabel = mode === "order" ? "Mark Ordered" : "Mark Received";
  const bulkColor =
    mode === "order"
      ? "bg-indigo-600 hover:bg-indigo-700"
      : "bg-emerald-600 hover:bg-emerald-700";

  const renderTable = (rs: QueueRow[]) => (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-text-secondary">
        <tr>
          {!isRecent && (
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </th>
          )}
          <th className="text-left px-3 py-2">Ticket</th>
          <th className="text-left px-3 py-2">Item</th>
          <th className="text-center px-3 py-2">Qty</th>
          <th className="text-left px-3 py-2">Vendor</th>
          <th className="text-left px-3 py-2">Link</th>
          <th className="text-right px-3 py-2">$/ea</th>
          <th className="text-right px-3 py-2">Subtotal</th>
          {mode === "order" && !isRecent && (
            <th className="text-left px-3 py-2">Need-by</th>
          )}
          {mode === "order" && isRecent && (
            <>
              <th className="text-left px-3 py-2">Order #</th>
              <th className="text-left px-3 py-2">Delivery</th>
            </>
          )}
          {mode === "receive" && !isRecent && (
            <>
              <th className="text-left px-3 py-2">Order #</th>
              <th className="text-left px-3 py-2">Delivery</th>
            </>
          )}
          {mode === "receive" && isRecent && (
            <>
              <th className="text-center px-3 py-2">Received</th>
              <th className="text-left px-3 py-2">On</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rs.map((r) => {
          const k = rowKey(r);
          const isSelected = selected.has(k);
          return (
            <tr
              key={k}
              className={`border-t border-border ${isSelected ? "bg-indigo-50" : ""}`}
            >
              {!isRecent && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(k)}
                    aria-label={`Select item ${r.item.name || r.item.url || ""}`}
                  />
                </td>
              )}
              <td className="px-3 py-2 text-xs">
                <Link
                  href={`/?ticket=${r.ticketId}`}
                  className="text-brand-primary hover:underline"
                >
                  #{r.ticketNumber ?? r.ticketId.slice(0, 8)}
                </Link>
              </td>
              <td className="px-3 py-2">
                {r.item.name && <strong>{r.item.name}</strong>}
                {r.item.name && r.item.url && (
                  <span className="text-text-secondary"> · </span>
                )}
                {r.item.url && (
                  <a
                    href={r.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline text-xs"
                  >
                    open
                  </a>
                )}
              </td>
              <td className="text-center px-3 py-2">{r.item.qty}</td>
              <td className="px-3 py-2">{r.displayVendor}</td>
              <td className="px-3 py-2 text-xs text-text-secondary truncate max-w-[180px]">
                {r.item.url ? (
                  <a href={r.item.url} target="_blank" rel="noopener noreferrer">
                    {r.item.url.replace(/^https?:\/\//, "").slice(0, 30)}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="text-right px-3 py-2">${r.item.cost.toFixed(2)}</td>
              <td className="text-right px-3 py-2">
                ${(r.item.qty * r.item.cost).toFixed(2)}
              </td>
              {mode === "order" && !isRecent && (
                <td className="px-3 py-2 text-xs">{r.ticketDueDate ?? "—"}</td>
              )}
              {mode === "order" && isRecent && (
                <>
                  <td className="px-3 py-2 text-xs">{r.item.orderNum ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.item.expectedDelivery ?? "—"}
                  </td>
                </>
              )}
              {mode === "receive" && !isRecent && (
                <>
                  <td className="px-3 py-2 text-xs">{r.item.orderNum ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.item.expectedDelivery ?? "—"}
                  </td>
                </>
              )}
              {mode === "receive" && isRecent && (
                <>
                  <td className="text-center px-3 py-2">
                    {r.item.receivedQty ?? 0} / {r.item.qty}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.item.receivedDate ?? "—"}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => {
              setTab("awaiting");
              setSelected(new Set());
            }}
            className={`px-4 py-1.5 text-sm font-medium ${
              tab === "awaiting"
                ? "bg-brand-primary text-white"
                : "bg-bg-card text-text-primary hover:bg-bg-subtle"
            }`}
          >
            {mode === "order" ? "Awaiting Order" : "Awaiting Receipt"} ({awaitingRows.length})
          </button>
          <button
            onClick={() => {
              setTab("recent");
              setSelected(new Set());
            }}
            className={`px-4 py-1.5 text-sm font-medium ${
              tab === "recent"
                ? "bg-brand-primary text-white"
                : "bg-bg-card text-text-primary hover:bg-bg-subtle"
            }`}
          >
            {mode === "order" ? "Recently Ordered" : "Recently Received"} ({recentRows.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">
            Sort:
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="ml-1 border border-border rounded text-xs px-1.5 py-1"
            >
              <option value="vendor">Vendor</option>
              <option value="ticket">Ticket #</option>
              <option value="cost">Subtotal (high → low)</option>
            </select>
          </label>

          {!isRecent && selected.size > 0 && (
            <button
              onClick={() => onBulkAction(selectedRows)}
              className={`px-4 py-1.5 text-sm rounded text-white font-medium ${bulkColor}`}
            >
              {bulkLabel} ({selected.size}{distinctTickets > 1 ? ` · ${distinctTickets} tickets` : ""})
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-text-secondary">Loading…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-12 text-text-secondary border border-dashed border-border rounded-lg">
          {isRecent
            ? `No items ${mode === "order" ? "ordered" : "received"} in the last 30 days.`
            : `Nothing waiting. Great work.`}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden bg-bg-card">
          {sortKey === "vendor" && groups ? (
            <div>
              {groups.map((g) => {
                const groupKeys = g.rows.map(rowKey);
                const groupSelected = groupKeys.every((k) => selected.has(k));
                return (
                  <div key={g.vendor}>
                    <div className="bg-bg-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary flex items-center gap-2 border-t border-border first:border-t-0">
                      {!isRecent && (
                        <input
                          type="checkbox"
                          checked={groupSelected}
                          onChange={() => selectVendorGroup(g.rows)}
                          aria-label={`Select all from ${g.vendor}`}
                        />
                      )}
                      {g.vendor} ({g.rows.length})
                    </div>
                    {renderTable(g.rows)}
                  </div>
                );
              })}
            </div>
          ) : (
            renderTable(sortedRows)
          )}
        </div>
      )}
    </div>
  );
}
