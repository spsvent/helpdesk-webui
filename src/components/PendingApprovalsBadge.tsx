"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getPendingApprovalsCount } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import { listPendingPurchaseApprovals } from "@/modules/purchase/purchaseService";
import { canApprovePurchase } from "@/modules/purchase/access";
import QueuePill from "./QueuePill";

interface PendingApprovalsBadgeProps {
  /** Highlighted when the Approvals queue is the current list view. */
  active?: boolean;
  onClick?: () => void;
}

// Work-queue pill: items awaiting an approval decision. A user may approve tickets
// (GM), purchases (admin), or both — the count merges both so this single
// "Approvals" pill covers everything awaiting them. Clicking filters the in-page
// list (see the parent's toggle handler). Shown to approvers whenever they can
// approve — even at zero — so the queue is always discoverable.
export default function PendingApprovalsBadge({ active = false, onClick }: PendingApprovalsBadgeProps) {
  const { instance, accounts } = useMsal();
  const { canApprove, permissions } = useRBAC();
  const [count, setCount] = useState<number>(0);

  const canApprovePurchases = canApprovePurchase(permissions);
  const canApproveAnything = canApprove() || canApprovePurchases;

  useEffect(() => {
    async function fetchCount() {
      if (!canApproveAnything || !accounts[0]) return;
      try {
        const client = getGraphClient(instance, accounts[0]);
        const [ticketCount, purchasePending] = await Promise.all([
          canApprove() ? getPendingApprovalsCount(client) : Promise.resolve(0),
          canApprovePurchases ? listPendingPurchaseApprovals(client) : Promise.resolve([]),
        ]);
        setCount(ticketCount + purchasePending.length);
      } catch (error) {
        console.error("Failed to fetch pending approvals count:", error);
      }
    }

    fetchCount();
  }, [canApprove, canApprovePurchases, canApproveAnything, accounts, instance]);

  if (!canApproveAnything) return null;

  return (
    <QueuePill
      label="Approvals"
      count={count}
      active={active}
      onClick={onClick}
      title={`${count} awaiting an approval decision`}
    />
  );
}
