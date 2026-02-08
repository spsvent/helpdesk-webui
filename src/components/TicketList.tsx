"use client";

import { memo, useCallback, useState, useEffect, useRef } from "react";
import { Ticket } from "@/types/ticket";
import { formatRelativeDate } from "@/lib/dateUtils";
import ApprovalStatusBadge from "./ApprovalStatusBadge";
import EmptyState from "./EmptyState";

interface TicketListProps {
  tickets: Ticket[];
  selectedId?: string;
  onSelect: (ticket: Ticket) => void;
  // Bulk selection (admin only)
  showCheckboxes?: boolean;
  checkedIds?: Set<string>;
  onToggleCheck?: (ticketId: string, shiftKey: boolean) => void;
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
      return { label: "URGENT", className: "priority-badge-urgent text-red-600 font-bold px-1.5 py-0.5 bg-red-50 rounded" };
    case "High":
      return { label: "HIGH", className: "priority-badge-high text-orange-600 font-semibold px-1.5 py-0.5 bg-orange-50 rounded" };
    default:
      return null;
  }
}


function TicketList({
  tickets,
  selectedId,
  onSelect,
  showCheckboxes = false,
  checkedIds = new Set(),
  onToggleCheck,
}: TicketListProps) {
  // Track if we should animate (only on initial load)
  const [shouldAnimate, setShouldAnimate] = useState(true);
  const hasAnimated = useRef(false);

  useEffect(() => {
    // Only animate once on initial mount
    if (!hasAnimated.current && tickets.length > 0) {
      hasAnimated.current = true;
      // Disable animation after it completes (approx 500ms)
      const timer = setTimeout(() => setShouldAnimate(false), 600);
      return () => clearTimeout(timer);
    }
  }, [tickets.length]);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent, ticketId: string) => {
      e.stopPropagation();
      onToggleCheck?.(ticketId, e.shiftKey);
    },
    [onToggleCheck]
  );

  if (tickets.length === 0) {
    return <EmptyState variant="no-tickets" />;
  }

  return (
    <div className="divide-y divide-border">
      {tickets.map((ticket) => {
        const priorityIndicator = getPriorityIndicator(ticket.priority);
        const isSelected = selectedId === ticket.id;
        const isChecked = checkedIds.has(ticket.id);
        return (
        <div
          key={ticket.id}
          className={`ticket-item flex items-start gap-2 p-4 cursor-pointer ${
            isSelected ? "ticket-item--selected" : ""
          } ${isChecked ? "ticket-item--checked" : ""} ${
            shouldAnimate ? "ticket-item--animate" : ""
          }`}
          onClick={() => onSelect(ticket)}
        >
          {showCheckboxes && (
            <div
              className="pt-0.5 shrink-0"
              onClick={(e) => handleCheckboxClick(e, ticket.id)}
            >
              <input
                type="checkbox"
                checked={checkedIds.has(ticket.id)}
                onChange={() => {}}
                className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-medium text-text-primary line-clamp-1">
                <span className="text-text-secondary font-normal">#{ticket.ticketNumber}</span>{" "}
                {ticket.title}
              </h3>
              {priorityIndicator && (
                <span className={`text-xs shrink-0 ${priorityIndicator.className}`}>
                  {priorityIndicator.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={getStatusBadgeClass(ticket.status)}>
                {ticket.status}
              </span>
              {ticket.approvalStatus && ticket.approvalStatus !== "None" && (
                <ApprovalStatusBadge status={ticket.approvalStatus} size="sm" />
              )}
              <span className="text-xs text-text-secondary">
                {ticket.problemType}
              </span>
          </div>

            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>{ticket.requester.displayName}</span>
              <span>{formatRelativeDate(ticket.created)}</span>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes but props are same
export default memo(TicketList);
