"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getPendingApprovalsCount } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import QueuePill from "./QueuePill";

interface PendingApprovalsBadgeProps {
  /** Highlighted when the Approvals queue is the current list view. */
  active?: boolean;
  onClick?: () => void;
}

// Work-queue pill: tickets awaiting an approval decision. Clicking filters the
// in-page list (see the parent's toggle handler). Shown to approvers whenever they
// can approve — even at zero — so the queue is always discoverable.
export default function PendingApprovalsBadge({ active = false, onClick }: PendingApprovalsBadgeProps) {
  const { instance, accounts } = useMsal();
  const { canApprove } = useRBAC();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCount() {
      if (!canApprove() || !accounts[0]) return;
      try {
        const client = getGraphClient(instance, accounts[0]);
        const pendingCount = await getPendingApprovalsCount(client);
        setCount(pendingCount);
      } catch (error) {
        console.error("Failed to fetch pending approvals count:", error);
      }
    }

    fetchCount();
  }, [canApprove, accounts, instance]);

  if (!canApprove()) return null;

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
