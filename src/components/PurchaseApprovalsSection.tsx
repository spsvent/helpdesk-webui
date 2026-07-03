"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import { listPendingPurchaseApprovals } from "@/modules/purchase/purchaseService";
import { canApprovePurchase } from "@/modules/purchase/access";
import { computeEstimatedTotal } from "@/modules/purchase/lineItems";
import type { PurchaseRequest } from "@/modules/purchase/types";

// The purchase half of the merged "Approvals" view. Purchase requests live in their
// own SharePoint list (separate detail page + approval UI), so rather than force them
// into the ticket table they render here as a visually-distinct block ABOVE the ticket
// approvals — indigo accent + a "PURCHASE" pill so they're never mistaken for tickets.
// Only shown to approvers; renders nothing when there are none pending.
export default function PurchaseApprovalsSection() {
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const [items, setItems] = useState<PurchaseRequest[]>([]);
  const [loaded, setLoaded] = useState(false);

  const canApprove = canApprovePurchase(permissions);

  useEffect(() => {
    if (!canApprove || !accounts[0]) return;
    let cancelled = false;
    (async () => {
      try {
        const client = getGraphClient(instance, accounts[0]);
        const pending = await listPendingPurchaseApprovals(client);
        if (!cancelled) setItems(pending);
      } catch (e) {
        console.error("[PurchaseApprovalsSection] load failed:", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canApprove, accounts, instance]);

  if (!canApprove || !loaded || items.length === 0) return null;

  return (
    <div className="border-b border-border bg-indigo-50/60">
      <div className="px-3 pt-3 pb-1.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Purchase Requests
        </span>
        <span className="text-[11px] text-indigo-700/70">{items.length} awaiting approval</span>
      </div>
      <ul className="pb-2">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/purchase/?id=${p.id}`}
              className="block mx-2 my-1 rounded-md border-l-4 border-indigo-500 bg-bg-card px-3 py-2 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">{p.title || "Untitled"}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 rounded px-1.5 py-0.5">
                  Purchase
                </span>
              </div>
              <div className="mt-0.5 text-xs text-text-secondary truncate">
                {p.requesterName || p.createdByName || "—"} · {p.lineItems.length} item
                {p.lineItems.length === 1 ? "" : "s"} · est. ${computeEstimatedTotal(p.lineItems).toFixed(2)}
                {p.sourceTicketNumber ? ` · #${p.sourceTicketNumber}` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
