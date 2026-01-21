"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getPendingApprovalsCount } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";

interface PendingApprovalsBadgeProps {
  onClick?: () => void;
}

export default function PendingApprovalsBadge({ onClick }: PendingApprovalsBadgeProps) {
  const { instance, accounts } = useMsal();
  const { canApprove } = useRBAC();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCount() {
      if (!canApprove() || !accounts[0]) {
        setLoading(false);
        return;
      }

      try {
        const client = getGraphClient(instance, accounts[0]);
        const pendingCount = await getPendingApprovalsCount(client);
        setCount(pendingCount);
      } catch (error) {
        console.error("Failed to fetch pending approvals count:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCount();
  }, [canApprove, accounts, instance]);

  // Don't render if user can't approve or there are no pending
  if (!canApprove() || loading || count === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="relative inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-lg text-sm font-medium transition-colors"
      title={`${count} pending approval${count !== 1 ? "s" : ""}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Approvals</span>
      <span className="inline-flex items-center justify-center w-5 h-5 bg-yellow-600 text-white text-xs font-bold rounded-full">
        {count > 9 ? "9+" : count}
      </span>
    </button>
  );
}
