"use client";

import { ApprovalStatus } from "@/types/ticket";

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus;
  size?: "sm" | "md";
}

const statusConfig: Record<ApprovalStatus, { label: string; className: string }> = {
  None: {
    label: "No Approval",
    className: "bg-gray-100 text-gray-600",
  },
  Pending: {
    label: "Pending Approval",
    className: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  },
  Approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800 border border-green-300",
  },
  Denied: {
    label: "Denied",
    className: "bg-red-100 text-red-800 border border-red-300",
  },
  "Changes Requested": {
    label: "Changes Requested",
    className: "bg-orange-100 text-orange-800 border border-orange-300",
  },
};

export default function ApprovalStatusBadge({ status, size = "md" }: ApprovalStatusBadgeProps) {
  // Don't show badge for "None" status
  if (status === "None") {
    return null;
  }

  const config = statusConfig[status];
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.className} ${sizeClasses}`}
    >
      {status === "Pending" && (
        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3" />
        </svg>
      )}
      {status === "Approved" && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === "Denied" && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {status === "Changes Requested" && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )}
      {config.label}
    </span>
  );
}
