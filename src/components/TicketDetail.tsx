"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import { getGraphClient, getComments, addComment } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import ConversationThread from "./ConversationThread";
import DetailsPanel from "./DetailsPanel";
import CommentInput from "./CommentInput";

interface TicketDetailProps {
  ticket: Ticket;
  onUpdate: (ticket: Ticket) => void;
}

function getStatusBadgeClass(status: Ticket["status"]): string {
  const classes: Record<Ticket["status"], string> = {
    "New": "bg-blue-500",
    "In Progress": "bg-green-500",
    "On Hold": "bg-yellow-500",
    "Resolved": "bg-emerald-500",
    "Closed": "bg-slate-500",
  };
  return `${classes[status] || "bg-blue-500"} text-white`;
}

function getPriorityClass(priority: Ticket["priority"]): string {
  const classes: Record<Ticket["priority"], string> = {
    "Low": "text-gray-500",
    "Normal": "text-blue-600",
    "High": "text-orange-600 font-semibold",
    "Urgent": "text-red-600 font-bold",
  };
  return classes[priority] || "text-blue-600";
}

export default function TicketDetail({ ticket, onUpdate }: TicketDetailProps) {
  const { instance, accounts } = useMsal();
  const { canEdit, canComment, isOwn, permissions } = useRBAC();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canEditThisTicket = canEdit(ticket);
  const canCommentOnThisTicket = canComment(ticket);
  const isOwnTicket = isOwn(ticket);

  // Fetch comments when ticket changes
  useEffect(() => {
    const fetchComments = async () => {
      if (!accounts[0]) return;

      setLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const ticketComments = await getComments(client, parseInt(ticket.id));
        setComments(ticketComments);
      } catch (e) {
        console.error("Failed to fetch comments:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [ticket.id, accounts, instance]);

  // Handle adding a new comment
  const handleAddComment = async (text: string, isInternal: boolean) => {
    if (!accounts[0] || !text.trim()) return;

    setSubmitting(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const newComment = await addComment(
        client,
        parseInt(ticket.id),
        text,
        isInternal
      );
      setComments((prev) => [...prev, newComment]);
    } catch (e) {
      console.error("Failed to add comment:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Ticket header */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-text-primary">
                {ticket.title}
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(
                  ticket.status
                )}`}
              >
                {ticket.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>#{ticket.id}</span>
              <span>
                {ticket.problemType}
                {ticket.problemTypeSub && ` / ${ticket.problemTypeSub}`}
                {ticket.problemTypeSub2 && ` / ${ticket.problemTypeSub2}`}
              </span>
              <span className={getPriorityClass(ticket.priority)}>
                {ticket.priority.toUpperCase()}
              </span>
              {isOwnTicket && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  Your ticket
                </span>
              )}
              {!canEditThisTicket && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  Read only
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - conversation + details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scrollable conversation thread */}
          <div className="flex-1 overflow-y-auto p-6 scroll-container">
            <ConversationThread
              ticket={ticket}
              comments={comments}
              loading={loading}
            />
          </div>

          {/* Comment input at bottom */}
          {canCommentOnThisTicket ? (
            <div className="border-t border-border bg-white p-4">
              <CommentInput
                onSubmit={handleAddComment}
                disabled={submitting}
              />
            </div>
          ) : (
            <div className="border-t border-border bg-gray-50 p-4 text-center text-sm text-text-secondary">
              You don&apos;t have permission to add comments to this ticket.
            </div>
          )}
        </div>

        {/* Details sidebar */}
        <aside className="w-80 border-l border-border bg-white overflow-y-auto scroll-container">
          <DetailsPanel
            ticket={ticket}
            onUpdate={onUpdate}
            canEdit={canEditThisTicket}
          />
        </aside>
      </div>
    </div>
  );
}
