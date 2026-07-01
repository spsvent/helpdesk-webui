"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PurchaseRequest } from "../types";
import { canCreatePurchase } from "../access";
import { ensurePurchaseList, isPurchaseConfigured, listPurchases, visiblePurchase } from "../purchaseService";
import { computeEstimatedTotal } from "../lineItems";
import PurchaseStatusBadge from "./PurchaseStatusBadge";
import MigrationPanel from "./MigrationPanel";

export default function PurchaseList() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions } = useRBAC();

  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const client = getGraphClient(instance, account);
        const all = await listPurchases(client);
        setPrs(all.filter((p) => visiblePurchase(p, permissions)));
      } catch (e) {
        console.error("[PurchaseList] load failed:", e);
        setError("Could not load purchase requests.");
      } finally {
        setLoading(false);
      }
    })();
  }, [account, instance, permissions]);

  async function handleSetup() {
    if (!account) return;
    setSetupBusy(true);
    setSetupResult(null);
    try {
      const client = getGraphClient(instance, account);
      setSetupResult(await ensurePurchaseList(client));
    } catch (e) {
      console.error("[PurchaseList] setup failed:", e);
      setSetupResult("error");
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Purchase Requests</h1>
        {canCreatePurchase(permissions) && (
          <Link href="/purchase/new" className="px-3 py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors">
            + New Purchase Request
          </Link>
        )}
      </div>

      {!isPurchaseConfigured() && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-2">
          <p>The PurchaseRequests list isn’t configured yet. Set <code className="mx-1">NEXT_PUBLIC_PURCHASE_LIST_ID</code> after creating it.</p>
          {permissions?.role === "admin" && (
            <div>
              <button type="button" onClick={handleSetup} disabled={setupBusy} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50">
                {setupBusy ? "Creating list…" : "Set up Purchase list"}
              </button>
              {setupResult === "error" ? (
                <p className="mt-2 text-red-700">Could not create the list.</p>
              ) : setupResult ? (
                <p className="mt-2">List created. Set <code className="mx-1">NEXT_PUBLIC_PURCHASE_LIST_ID</code> + the Function App’s <code className="mx-1">PURCHASE_LIST_ID</code> to: <code className="break-all">{setupResult}</code>, then redeploy.</p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {permissions?.role === "admin" && isPurchaseConfigured() && <MigrationPanel />}

      {loading ? (
        <div className="p-8"><LoadingSpinner /></div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : prs.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">No purchase requests yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border border-border rounded-lg overflow-hidden">
          {prs.map((p) => (
            <li key={p.id}>
              <Link href={`/purchase/?id=${p.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-bg-subtle transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{p.title || "Untitled"}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {p.requesterName || p.createdByName} · {p.lineItems.length} item{p.lineItems.length === 1 ? "" : "s"} · est. ${computeEstimatedTotal(p.lineItems).toFixed(2)}
                  </p>
                </div>
                <PurchaseStatusBadge status={p.purchaseStatus} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
