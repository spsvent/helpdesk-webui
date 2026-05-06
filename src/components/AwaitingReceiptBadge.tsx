"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getUnreceivedItemCount } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";

export default function AwaitingReceiptBadge() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const isInventory = permissions?.isInventory ?? false;

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      if (!isInventory || !accounts[0]) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const client = getGraphClient(instance, accounts[0]);
        const n = await getUnreceivedItemCount(client);
        if (!cancelled) setCount(n);
      } catch (e) {
        console.error("Failed to fetch awaiting-receipt count:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [isInventory, accounts, instance]);

  if (!isInventory || loading || count === 0) return null;

  return (
    <button
      onClick={() => router.push("/receiving")}
      className="relative inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-medium transition-colors"
      title={`${count} item${count !== 1 ? "s" : ""} awaiting receipt`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        />
      </svg>
      <span>To Receive</span>
      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 bg-emerald-600 text-white text-xs font-bold rounded-full">
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}
