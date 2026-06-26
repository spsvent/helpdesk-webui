"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CDWBrief } from "../types";
import { canCreateCdw } from "../access";
import { ensureCdwList, isCdwConfigured, listCdw, visibleCdw } from "../cdwService";
import CdwStatusBadge from "./CdwStatusBadge";

export default function CdwList() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions } = useRBAC();

  const [briefs, setBriefs] = useState<CDWBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);

  async function handleSetup() {
    if (!account) return;
    setSetupBusy(true);
    setSetupResult(null);
    try {
      const client = getGraphClient(instance, account);
      const listId = await ensureCdwList(client);
      setSetupResult(listId);
    } catch (e) {
      console.error("[CdwList] setup failed:", e);
      setSetupResult("error");
    } finally {
      setSetupBusy(false);
    }
  }

  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const client = getGraphClient(instance, account);
        const all = await listCdw(client);
        setBriefs(all.filter((b) => visibleCdw(b, permissions)));
      } catch (e) {
        console.error("[CdwList] load failed:", e);
        setError("Could not load creative briefs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [account, instance, permissions]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Creative Briefs (CDW)</h1>
        {canCreateCdw(permissions) && (
          <Link
            href="/cdw/new"
            className="px-3 py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors"
          >
            + New CDW
          </Link>
        )}
      </div>

      {!isCdwConfigured() && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-2">
          <p>
            The CDW list isn’t configured yet. An administrator needs to create the CDW SharePoint
            list and set <code className="mx-1">NEXT_PUBLIC_CDW_LIST_ID</code> (in the deploy workflow), then redeploy.
          </p>
          {permissions?.role === "admin" && (
            <div>
              <button
                type="button"
                onClick={handleSetup}
                disabled={setupBusy}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {setupBusy ? "Creating list…" : "Set up CDW list"}
              </button>
              {setupResult === "error" ? (
                <p className="mt-2 text-red-700">Could not create the list. Check permissions and try again.</p>
              ) : setupResult ? (
                <p className="mt-2">
                  List created. Set <code className="mx-1">NEXT_PUBLIC_CDW_LIST_ID</code> and the Function App’s
                  <code className="mx-1">CDW_LIST_ID</code> to: <code className="break-all">{setupResult}</code>, then redeploy.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-8"><LoadingSpinner /></div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : briefs.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">No briefs yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border border-border rounded-lg overflow-hidden">
          {briefs.map((b) => (
            <li key={b.id}>
              <Link href={`/cdw/?id=${b.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-bg-subtle transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{b.title || "Untitled"}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {b.requesterName || b.createdByName}
                    {b.deadline ? ` · due ${b.deadline}` : ""}
                  </p>
                </div>
                <CdwStatusBadge status={b.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
