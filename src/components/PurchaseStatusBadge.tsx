"use client";

import { PurchaseStatus } from "@/types/ticket";

interface PurchaseStatusBadgeProps {
  status: PurchaseStatus;
  size?: "sm" | "md";
}

const statusConfig: Record<PurchaseStatus, { label: string; className: string }> = {
  "Pending Approval": {
    label: "Pending Approval",
    className: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  },
  "Approved": {
    label: "Approved",
    className: "bg-green-100 text-green-800 border border-green-300",
  },
  "Approved with Changes": {
    label: "Approved w/ Changes",
    className: "bg-orange-100 text-orange-800 border border-orange-300",
  },
  "Ordered": {
    label: "Ordered",
    className: "bg-blue-100 text-blue-800 border border-blue-300",
  },
  "Purchased": {
    label: "Purchased",
    className: "bg-indigo-100 text-indigo-800 border border-indigo-300",
  },
  "Received": {
    label: "Received",
    className: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  },
  "Denied": {
    label: "Denied",
    className: "bg-red-100 text-red-800 border border-red-300",
  },
};

export default function PurchaseStatusBadge({ status, size = "md" }: PurchaseStatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) return null;

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.className} ${sizeClasses}`}
    >
      {status === "Pending Approval" && (
        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3" />
        </svg>
      )}
      {(status === "Approved" || status === "Approved with Changes") && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {(status === "Ordered" || status === "Purchased") && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      )}
      {status === "Received" && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      )}
      {status === "Denied" && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {config.label}
    </span>
  );
}
