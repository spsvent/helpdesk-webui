"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { getUnorderedItemCount } from "@/modules/purchase/purchaseService";
import { useRBAC } from "@/contexts/RBACContext";
import QueuePill from "./QueuePill";

// Work-queue pill: purchase line items awaiting an order. Navigates to the
// dedicated /orders line-item queue. Shown to purchasers whenever they have the
// capability — even at zero — so the queue is always discoverable.
export default function AwaitingOrderBadge() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const [count, setCount] = useState<number>(0);

  const isPurchaser = permissions?.isPurchaser ?? false;

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      if (!isPurchaser || !accounts[0]) return;
      try {
        const client = getGraphClient(instance, accounts[0]);
        const n = await getUnorderedItemCount(client);
        if (!cancelled) setCount(n);
      } catch (e) {
        console.error("Failed to fetch awaiting-order count:", e);
      }
    }
    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [isPurchaser, accounts, instance]);

  if (!isPurchaser) return null;

  return (
    <QueuePill
      label="Needs ordering"
      count={count}
      onClick={() => router.push("/orders")}
      title={`${count} item${count !== 1 ? "s" : ""} awaiting order`}
    />
  );
}
