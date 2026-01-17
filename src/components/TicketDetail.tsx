"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import { getGraphClient, getComments, addComment } from "@/lib/graphClient";
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
    "Pending": "bg-yellow-500",
    "On Hold": "bg-gray-500",
    "Resolved": "bg-emerald-500",
    "Closed": "bg-slate-500",
  };
  return `${classes[status] || "bg-blue-500"} text-white`;
}

export default function TicketDetail({ ticket, onUpdate }: TicketDetailProps) {
  const { instance, accounts } = useMsal();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
              <span>{ticket.problemType}</span>
              {ticket.priority === "Urgent" && (
                <span className="text-red-600 font-semibold">URGENT</span>
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
          <div className="border-t border-border bg-white p-4">
            <CommentInput
              onSubmit={handleAddComment}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Details sidebar */}
        <aside className="w-80 border-l border-border bg-white overflow-y-auto scroll-container">
          <DetailsPanel
            ticket={ticket}
            onUpdate={onUpdate}
          />
        </aside>
      </div>
    </div>
  );
}
