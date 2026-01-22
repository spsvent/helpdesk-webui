"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment, Attachment } from "@/types/ticket";
import {
  getGraphClient,
  getComments,
  addComment,
  requestApproval,
  processApprovalDecision,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
} from "@/lib/graphClient";
import { sendApprovalRequestEmail, sendDecisionEmail, sendCommentEmail } from "@/lib/emailService";
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
    "New": "bg-brand-primary",
    "In Progress": "bg-brand-green",
    "On Hold": "bg-brand-yellow",
    "Resolved": "bg-emerald-500",
    "Closed": "bg-slate-500",
  };
  return `${classes[status] || "bg-brand-primary"} text-white`;
}

function getPriorityClass(priority: Ticket["priority"]): string {
  const classes: Record<Ticket["priority"], string> = {
    "Low": "text-text-secondary",
    "Normal": "text-brand-primary",
    "High": "text-orange-600 font-semibold",
    "Urgent": "text-brand-red font-bold",
  };
  return classes[priority] || "text-brand-primary";
}

type MobileDetailView = "comments" | "details";

export default function TicketDetail({ ticket, onUpdate }: TicketDetailProps) {
  const { instance, accounts } = useMsal();
  const { canEdit, canComment, isOwn, permissions } = useRBAC();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Mobile view state
  const [mobileDetailView, setMobileDetailView] = useState<MobileDetailView>("comments");
  const [isMobile, setIsMobile] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  // Right sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(320); // 320px = w-80 default
  const isResizing = useRef(false);
  const MIN_SIDEBAR_WIDTH = 240;
  const MAX_SIDEBAR_WIDTH = 500;

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // Fetch attachments when ticket changes
  useEffect(() => {
    const fetchAttachments = async () => {
      if (!accounts[0]) return;

      setAttachmentsLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const ticketAttachments = await getAttachments(client, ticket.id, instance, accounts[0]);
        setAttachments(ticketAttachments);
      } catch (e) {
        console.error("Failed to fetch attachments:", e);
      } finally {
        setAttachmentsLoading(false);
      }
    };

    fetchAttachments();
  }, [ticket.id, accounts, instance]);

  // Handle adding a new comment
  const handleAddComment = async (text: string, isInternal: boolean) => {
    if (!accounts[0] || !text.trim()) return;

    setSubmitting(true);
    const commenterEmail = accounts[0].username;
    const commenterName = accounts[0].name || accounts[0].username;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const newComment = await addComment(
        client,
        parseInt(ticket.id),
        text,
        isInternal
      );
      setComments((prev) => [...prev, newComment]);

      // Send email notifications for non-internal comments
      if (!isInternal) {
        // Notify requester if commenter is not the requester
        if (ticket.requester.email && ticket.requester.email !== commenterEmail) {
          sendCommentEmail(
            client,
            ticket,
            ticket.requester.email,
            commenterName,
            text,
            true // recipientIsRequester
          ).catch((e) => console.error("Failed to send comment email to requester:", e));
        }

        // Notify assignee if there is one and they're not the commenter
        const assigneeEmail = ticket.assignedTo?.email;
        if (assigneeEmail && assigneeEmail !== commenterEmail && assigneeEmail !== ticket.requester.email) {
          sendCommentEmail(
            client,
            ticket,
            assigneeEmail,
            commenterName,
            text,
            false // recipientIsRequester
          ).catch((e) => console.error("Failed to send comment email to assignee:", e));
        }
      }
    } catch (e) {
      console.error("Failed to add comment:", e);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle uploading an attachment
  const handleUploadAttachment = async (file: File): Promise<boolean> => {
    if (!accounts[0]) return false;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const attachment = await uploadAttachment(client, ticket.id, file, instance, accounts[0]);
      if (attachment) {
        setAttachments((prev) => [...prev, attachment]);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to upload attachment:", e);
      return false;
    }
  };

  // Handle deleting an attachment
  const handleDeleteAttachment = async (filename: string): Promise<void> => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const success = await deleteAttachment(client, ticket.id, filename, instance, accounts[0]);
      if (success) {
        setAttachments((prev) => prev.filter((a) => a.name !== filename));
      }
    } catch (e) {
      console.error("Failed to delete attachment:", e);
    }
  };

  // Handle downloading an attachment
  const handleDownloadAttachment = async (filename: string): Promise<void> => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const blob = await downloadAttachment(client, ticket.id, filename, instance, accounts[0]);
      if (blob) {
        // Create a download link and trigger it
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Failed to download attachment:", e);
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
      <div className="bg-bg-card border-b border-border px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
              <h1 className="text-lg md:text-xl font-semibold text-text-primary truncate max-w-full">
                {ticket.title}
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(
                  ticket.status
                )}`}
              >
                {ticket.status}
              </span>
              <ApprovalStatusBadge status={ticket.approvalStatus} size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-text-secondary">
              <span>#{ticket.id}</span>
              <span className="hidden sm:inline">
                {ticket.problemType}
                {ticket.problemTypeSub && ` / ${ticket.problemTypeSub}`}
                {ticket.problemTypeSub2 && ` / ${ticket.problemTypeSub2}`}
              </span>
              <span className="sm:hidden">{ticket.problemType}</span>
              <span className={getPriorityClass(ticket.priority)}>
                {ticket.priority.toUpperCase()}
              </span>
              {isOwnTicket && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded whitespace-nowrap">
                  Your ticket
                </span>
              )}
              {!canEditThisTicket && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded whitespace-nowrap">
                  Read only
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile panel toggle */}
      {isMobile && (
        <div className="flex border-b border-border bg-bg-card">
          <button
            onClick={() => setMobileDetailView("comments")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              mobileDetailView === "comments"
                ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setMobileDetailView("details")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              mobileDetailView === "details"
                ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Details
          </button>
        </div>
      )}

      {/* Main content area - conversation + details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation panel - hide on mobile when viewing details */}
        {(!isMobile || mobileDetailView === "comments") && (
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
              <div className="border-t border-border bg-bg-card p-4">
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
        )}

        {/* Resize handle - desktop only */}
        {!isMobile && (
          <div
            onMouseDown={startResizing}
            className="w-1 cursor-col-resize hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors shrink-0"
            title="Drag to resize"
          />
        )}

        {/* Details sidebar - on mobile, show full width when selected */}
        {(!isMobile || mobileDetailView === "details") && (
          <aside
            className={`border-l border-border bg-bg-card overflow-y-auto scroll-container shrink-0 ${
              isMobile ? "flex-1 border-l-0" : ""
            }`}
            style={isMobile ? undefined : { width: sidebarWidth }}
          >
            <DetailsPanel
              ticket={ticket}
              onUpdate={onUpdate}
              canEdit={canEditThisTicket}
              onRequestApproval={handleRequestApproval}
              onApprovalDecision={handleApprovalDecision}
              attachments={attachments}
              attachmentsLoading={attachmentsLoading}
              onUploadAttachment={handleUploadAttachment}
              onDeleteAttachment={handleDeleteAttachment}
              onDownloadAttachment={handleDownloadAttachment}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
