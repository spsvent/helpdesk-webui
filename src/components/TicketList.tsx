"use client";

import { memo } from "react";
import { Ticket } from "@/types/ticket";
import { formatRelativeDate } from "@/lib/dateUtils";

interface TicketListProps {
  tickets: Ticket[];
  selectedId?: string;
  onSelect: (ticket: Ticket) => void;
}

function getStatusBadgeClass(status: Ticket["status"]): string {
  const classes: Record<Ticket["status"], string> = {
    "New": "badge-new",
    "In Progress": "badge-in-progress",
    "On Hold": "badge-on-hold",
    "Resolved": "badge-resolved",
    "Closed": "badge-closed",
  };
  return `badge ${classes[status] || "badge-new"}`;
}

function getPriorityIndicator(priority: Ticket["priority"]): { label: string; className: string } | null {
  switch (priority) {
    case "Urgent":
      return { label: "URGENT", className: "text-red-600 font-bold" };
    case "High":
      return { label: "HIGH", className: "text-orange-600 font-semibold" };
    default:
      return null;
  }
}


function TicketList({ tickets, selectedId, onSelect }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-text-secondary mb-4">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium text-text-primary mb-1">No tickets yet</p>
          <p className="text-sm">Create your first support ticket to get started.</p>
        </div>
        <a
          href="/new"
          className="inline-block px-4 py-2 bg-brand-blue text-white text-sm rounded-lg font-medium hover:bg-brand-blue-light transition-colors"
        >
          + New Ticket
        </a>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {tickets.map((ticket) => {
        const priorityIndicator = getPriorityIndicator(ticket.priority);
        return (
        <button
          key={ticket.id}
          onClick={() => onSelect(ticket)}
          className={`w-full text-left p-4 hover:bg-bg-subtle transition-colors ${
            selectedId === ticket.id ? "bg-brand-primary/10 border-l-4 border-brand-primary" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-medium text-text-primary line-clamp-1">
              {ticket.title}
            </h3>
            {priorityIndicator && (
              <span className={`text-xs shrink-0 ${priorityIndicator.className}`}>
                {priorityIndicator.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={getStatusBadgeClass(ticket.status)}>
              {ticket.status}
            </span>
            <span className="text-xs text-text-secondary">
              {ticket.problemType}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{ticket.requester.displayName}</span>
            <span>{formatRelativeDate(ticket.created)}</span>
          </div>
        </button>
        );
      })}
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes but props are same
export default memo(TicketList);
