"use client";

import { Ticket } from "@/types/ticket";

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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function TicketList({ tickets, selectedId, onSelect }: TicketListProps) {
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
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          onClick={() => onSelect(ticket)}
          className={`w-full text-left p-4 hover:bg-bg-subtle transition-colors ${
            selectedId === ticket.id ? "bg-blue-50 border-l-4 border-brand-blue" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-medium text-text-primary line-clamp-1">
              {ticket.title}
            </h3>
            {getPriorityIndicator(ticket.priority) && (
              <span className={`text-xs shrink-0 ${getPriorityIndicator(ticket.priority)!.className}`}>
                {getPriorityIndicator(ticket.priority)!.label}
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
            <span>{formatDate(ticket.created)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
