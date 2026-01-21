"use client";

import { Ticket } from "@/types/ticket";

interface ApprovalHistoryProps {
  ticket: Ticket;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ApprovalHistory({ ticket }: ApprovalHistoryProps) {
  // Don't show if no approval activity
  if (ticket.approvalStatus === "None") {
    return null;
  }

  const hasRequest = ticket.approvalRequestedBy || ticket.approvalRequestedDate;
  const hasDecision = ticket.approvedBy || ticket.approvalDate;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-text-primary">Approval History</h4>

      <div className="space-y-2">
        {/* Request Entry */}
        {hasRequest && (
          <div className="flex items-start gap-3 text-sm">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary">
                <span className="font-medium">
                  {ticket.approvalRequestedBy?.displayName || "Unknown"}
                </span>{" "}
                requested approval
              </p>
              {ticket.approvalRequestedDate && (
                <p className="text-text-secondary text-xs">
                  {formatDate(ticket.approvalRequestedDate)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Decision Entry */}
        {hasDecision && ticket.approvalStatus !== "Pending" && (
          <div className="flex items-start gap-3 text-sm">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                ticket.approvalStatus === "Approved"
                  ? "bg-green-100"
                  : ticket.approvalStatus === "Denied"
                  ? "bg-red-100"
                  : "bg-orange-100"
              }`}
            >
              {ticket.approvalStatus === "Approved" && (
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {ticket.approvalStatus === "Denied" && (
                <svg
                  className="w-4 h-4 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              {ticket.approvalStatus === "Changes Requested" && (
                <svg
                  className="w-4 h-4 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary">
                <span className="font-medium">
                  {ticket.approvedBy?.displayName || "Unknown"}
                </span>{" "}
                <span
                  className={`${
                    ticket.approvalStatus === "Approved"
                      ? "text-green-700"
                      : ticket.approvalStatus === "Denied"
                      ? "text-red-700"
                      : "text-orange-700"
                  }`}
                >
                  {ticket.approvalStatus === "Approved"
                    ? "approved"
                    : ticket.approvalStatus === "Denied"
                    ? "denied"
                    : "requested changes"}
                </span>
              </p>
              {ticket.approvalDate && (
                <p className="text-text-secondary text-xs">
                  {formatDate(ticket.approvalDate)}
                </p>
              )}
              {ticket.approvalNotes && (
                <p className="text-text-secondary text-xs mt-1 italic">
                  &quot;{ticket.approvalNotes}&quot;
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pending indicator */}
        {ticket.approvalStatus === "Pending" && !hasDecision && (
          <div className="flex items-start gap-3 text-sm">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-yellow-600 animate-pulse"
                fill="currentColor"
                viewBox="0 0 8 8"
              >
                <circle cx="4" cy="4" r="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary">Awaiting manager decision</p>
              <p className="text-text-secondary text-xs">
                General Managers have been notified
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
