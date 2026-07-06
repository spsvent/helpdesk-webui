"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { getUnreceivedItemCount } from "@/modules/purchase/purchaseService";
import { useRBAC } from "@/contexts/RBACContext";
import QueuePill from "./QueuePill";

// Work-queue pill: purchase line items awaiting receipt. Navigates to the
// dedicated /receiving line-item queue. Shown to inventory staff whenever they have
// the capability — even at zero — so the queue is always discoverable.
export default function AwaitingReceiptBadge() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const [count, setCount] = useState<number>(0);

  const isInventory = permissions?.isInventory ?? false;

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      if (!isInventory || !accounts[0]) return;
      try {
        const client = getGraphClient(instance, accounts[0]);
        const n = await getUnreceivedItemCount(client);
        if (!cancelled) setCount(n);
      } catch (e) {
        console.error("Failed to fetch awaiting-receipt count:", e);
      }
    }
    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [isInventory, accounts, instance]);

  if (!isInventory) return null;

  return (
    <QueuePill
      label="Needs receiving"
      count={count}
      onClick={() => router.push("/receiving")}
      title={`${count} item${count !== 1 ? "s" : ""} awaiting receipt`}
    />
  );
}
