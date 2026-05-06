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

// Friendly fallback for the Item column when the requester didn't fill in a
// name. Strip the URL down to a short identifier (last path segment + host).
function deriveItemLabel(row: QueueRow): string {
  if (row.item.name?.trim()) return row.item.name;
  if (row.item.url) {
    try {
      const u = new URL(/^https?:\/\//i.test(row.item.url) ? row.item.url : `https://${row.item.url}`);
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) return last.replace(/[-_]/g, " ").slice(0, 60);
      return u.hostname.replace(/^www\./, "");
    } catch {
      // fall through
    }
  }
  return `Item ${row.itemIndex + 1}`;
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

  // Column count drives colSpan on group-divider rows when grouping by vendor.
  // Columns: select(only when !isRecent) + ticket + item + qty + vendor + $/ea + subtotal + extras
  const orderExtras = mode === "order" && !isRecent ? 1 : mode === "order" && isRecent ? 2 : 0;
  const receiveExtras = mode === "receive" && !isRecent ? 2 : mode === "receive" && isRecent ? 2 : 0;
  const colCount = (isRecent ? 0 : 1) + 6 + orderExtras + receiveExtras;

  const renderHeaderRow = () => (
    <tr className="bg-bg-subtle text-text-secondary">
      {!isRecent && (
        <th className="px-3 py-2 w-8 text-left">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all"
          />
        </th>
      )}
      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        Ticket
      </th>
      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        Item
      </th>
      <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        Qty
      </th>
      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        Vendor
      </th>
      <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        $/ea
      </th>
      <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
        Subtotal
      </th>
      {mode === "order" && !isRecent && (
        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
          Need-by
        </th>
      )}
      {mode === "order" && isRecent && (
        <>
          <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            Order #
          </th>
          <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            Delivery
          </th>
        </>
      )}
      {mode === "receive" && !isRecent && (
        <>
          <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            Order #
          </th>
          <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            Delivery
          </th>
        </>
      )}
      {mode === "receive" && isRecent && (
        <>
          <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            Received
          </th>
          <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold">
            On
          </th>
        </>
      )}
    </tr>
  );

  const renderDataRow = (r: QueueRow) => {
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
              aria-label={`Select item ${deriveItemLabel(r)}`}
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
          {r.item.url ? (
            <a
              href={r.item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-primary hover:underline"
              title={r.item.url}
            >
              {deriveItemLabel(r)}
            </a>
          ) : (
            <span className="text-text-primary">{deriveItemLabel(r)}</span>
          )}
        </td>
        <td className="text-center px-3 py-2 tabular-nums">{r.item.qty}</td>
        <td className="px-3 py-2">{r.displayVendor}</td>
        <td className="text-right px-3 py-2 tabular-nums">${r.item.cost.toFixed(2)}</td>
        <td className="text-right px-3 py-2 tabular-nums font-medium">
          ${(r.item.qty * r.item.cost).toFixed(2)}
        </td>
        {mode === "order" && !isRecent && (
          <td className="px-3 py-2 text-xs text-text-secondary">{r.ticketDueDate ?? "—"}</td>
        )}
        {mode === "order" && isRecent && (
          <>
            <td className="px-3 py-2 text-xs">{r.item.orderNum ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{r.item.expectedDelivery ?? "—"}</td>
          </>
        )}
        {mode === "receive" && !isRecent && (
          <>
            <td className="px-3 py-2 text-xs">{r.item.orderNum ?? "—"}</td>
            <td className="px-3 py-2 text-xs">{r.item.expectedDelivery ?? "—"}</td>
          </>
        )}
        {mode === "receive" && isRecent && (
          <>
            <td className="text-center px-3 py-2 tabular-nums">
              {r.item.receivedQty ?? 0} / {r.item.qty}
            </td>
            <td className="px-3 py-2 text-xs">{r.item.receivedDate ?? "—"}</td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-4 font-body">
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
          <label className="text-xs text-text-secondary flex items-center gap-1">
            Sort:
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="border border-border rounded text-xs px-1.5 py-1 bg-bg-card"
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
          <table className="w-full text-sm">
            <thead>{renderHeaderRow()}</thead>
            <tbody>
              {sortKey === "vendor" && groups
                ? groups.map((g) => {
                    const groupKeys = g.rows.map(rowKey);
                    const groupSelected = !isRecent && groupKeys.every((k) => selected.has(k));
                    return (
                      <RowFragment key={g.vendor}>
                        <tr className="bg-bg-subtle/60 border-t border-border">
                          <td colSpan={colCount} className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
                              {!isRecent && (
                                <input
                                  type="checkbox"
                                  checked={groupSelected}
                                  onChange={() => selectVendorGroup(g.rows)}
                                  aria-label={`Select all from ${g.vendor}`}
                                />
                              )}
                              {g.vendor}
                              <span className="font-normal text-text-secondary/80">
                                · {g.rows.length} item{g.rows.length === 1 ? "" : "s"}
                              </span>
                            </span>
                          </td>
                        </tr>
                        {g.rows.map(renderDataRow)}
                      </RowFragment>
                    );
                  })
                : sortedRows.map(renderDataRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Tiny helper so we can group rows under a key without an extra DOM node.
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
