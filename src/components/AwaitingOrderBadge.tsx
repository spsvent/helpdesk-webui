"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { getUnorderedItemCount } from "@/modules/purchase/purchaseService";
import { useRBAC } from "@/contexts/RBACContext";

export default function AwaitingOrderBadge() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const isPurchaser = permissions?.isPurchaser ?? false;

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      if (!isPurchaser || !accounts[0]) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const client = getGraphClient(instance, accounts[0]);
        const n = await getUnorderedItemCount(client);
        if (!cancelled) setCount(n);
      } catch (e) {
        console.error("Failed to fetch awaiting-order count:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [isPurchaser, accounts, instance]);

  if (!isPurchaser || loading || count === 0) return null;

  return (
    <button
      onClick={() => router.push("/orders")}
      className="relative inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg text-sm font-medium transition-colors"
      title={`${count} item${count !== 1 ? "s" : ""} awaiting order`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
        />
      </svg>
      <span>To Order</span>
      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 bg-indigo-600 text-white text-xs font-bold rounded-full">
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}
