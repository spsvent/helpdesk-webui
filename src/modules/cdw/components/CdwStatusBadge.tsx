"use client";

import { CdwStatus } from "../types";

const config: Record<CdwStatus, { label: string; className: string }> = {
  Draft: { label: "Draft", className: "bg-gray-100 text-gray-600 border border-gray-300" },
  "Pending Approval": { label: "Pending Approval", className: "bg-yellow-100 text-yellow-800 border border-yellow-300" },
  Approved: { label: "Approved · Public", className: "bg-green-100 text-green-800 border border-green-300" },
  Denied: { label: "Denied", className: "bg-red-100 text-red-800 border border-red-300" },
  "Changes Requested": { label: "Changes Requested", className: "bg-orange-100 text-orange-800 border border-orange-300" },
};

export default function CdwStatusBadge({ status, size = "md" }: { status: CdwStatus; size?: "sm" | "md" }) {
  // mapToCdw casts the raw column value, so a hand-edited list value can arrive
  // here outside CdwStatus — show it in a neutral (Draft-style) badge rather
  // than crashing the page on config[status].className.
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border border-gray-300" };
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${c.className} ${sizeClasses}`}>
      {status === "Pending Approval" && (
        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>
      )}
      {c.label}
    </span>
  );
}
