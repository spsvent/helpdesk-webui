"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import {
  getGraphClient,
  getComments,
  addComment,
  requestApproval,
  processApprovalDecision,
} from "@/lib/graphClient";
import { sendApprovalRequestEmail, sendDecisionEmail } from "@/lib/emailService";
import { useRBAC } from "@/contexts/RBACContext";
import ConversationThread from "./ConversationThread";
import DetailsPanel from "./DetailsPanel";
import CommentInput from "./CommentInput";
import ApprovalStatusBadge from "./ApprovalStatusBadge";

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

  // Right sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(320); // 320px = w-80 default
  const isResizing = useRef(false);
  const MIN_SIDEBAR_WIDTH = 240;
  const MAX_SIDEBAR_WIDTH = 500;

  // Handle sidebar resize
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Calculate from right edge
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  // Handle requesting approval
  const handleRequestApproval = async () => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const requesterName = accounts[0].name || accounts[0].username;

    // Update ticket status to Pending
    const updatedTicket = await requestApproval(client, ticket.id, requesterName);
    onUpdate(updatedTicket);

    // Send email notifications to managers
    await sendApprovalRequestEmail(client, updatedTicket, requesterName);

    // Add internal note about approval request
    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      `Approval requested by ${requesterName}`,
      true,
      "Approval"
    );
    setComments((prev) => [...prev, approvalComment]);
  };

  // Handle approval decision
  const handleApprovalDecision = async (
    decision: "Approved" | "Denied" | "Changes Requested",
    notes?: string
  ) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const approverName = accounts[0].name || accounts[0].username;

    // Process the approval decision
    const updatedTicket = await processApprovalDecision(
      client,
      ticket.id,
      decision,
      approverName,
      notes
    );
    onUpdate(updatedTicket);

    // Add internal note about the decision
    const noteText = notes
      ? `**${decision}** by ${approverName}\n\nNotes: ${notes}`
      : `**${decision}** by ${approverName}`;

    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      noteText,
      true,
      "Approval"
    );
    setComments((prev) => [...prev, approvalComment]);

    // Send notification to the person who requested approval (if there was a requester)
    if (ticket.approvalRequestedBy?.email) {
      await sendDecisionEmail(
        client,
        updatedTicket,
        decision,
        approverName,
        ticket.approvalRequestedBy.email,
        notes
      );
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
              <ApprovalStatusBadge status={ticket.approvalStatus} size="sm" />
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

        {/* Resize handle */}
        <div
          onMouseDown={startResizing}
          className="w-1 cursor-col-resize hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors shrink-0"
          title="Drag to resize"
        />

        {/* Details sidebar */}
        <aside
          className="border-l border-border bg-white overflow-y-auto scroll-container shrink-0"
          style={{ width: sidebarWidth }}
        >
          <DetailsPanel
            ticket={ticket}
            onUpdate={onUpdate}
            canEdit={canEditThisTicket}
            onRequestApproval={handleRequestApproval}
            onApprovalDecision={handleApprovalDecision}
          />
        </aside>
      </div>
    </div>
  );
}
