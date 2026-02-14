"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment, Attachment } from "@/types/ticket";
import {
  getGraphClient,
  getComments,
  addComment,
  getTicket,
  requestApproval,
  processApprovalDecision,
  updatePurchaseFields,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  logActivity,
} from "@/lib/graphClient";
import {
  sendApprovalRequestEmail,
  sendDecisionEmail,
  sendCommentEmail,
  sendPurchaseApprovedEmail,
  sendPurchaseOrderedEmail,
  sendPurchaseReceivedEmail,
} from "@/lib/emailService";
import { useRBAC } from "@/contexts/RBACContext";
import { sendNewTicketTeamsNotification } from "@/lib/teamsService";
import ConversationThread from "./ConversationThread";
import DetailsPanel from "./DetailsPanel";
import CommentInput from "./CommentInput";
import ApprovalStatusBadge from "./ApprovalStatusBadge";
import NudgeApprovalButton from "./NudgeApprovalButton";

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

  // Ref to access DetailsPanel save function
  const detailsPanelSaveRef = useRef<{ save: () => Promise<void>; hasChanges: boolean } | null>(null);

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
      // Save any pending details changes first
      if (detailsPanelSaveRef.current?.hasChanges) {
        await detailsPanelSaveRef.current.save();
      }

      const client = getGraphClient(instance, accounts[0]);
      const newComment = await addComment(
        client,
        parseInt(ticket.id),
        text,
        isInternal
      );
      setComments((prev) => [...prev, newComment]);

      // Log the comment activity
      logActivity(client, {
        eventType: "comment_added",
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
        actor: commenterEmail,
        actorName: commenterName,
        description: `${isInternal ? "Internal note" : "Comment"} added by ${commenterName}`,
        details: JSON.stringify({
          isInternal,
          commentId: newComment.id,
          textPreview: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        }),
      }).catch((e) => console.error("Failed to log comment activity:", e));

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
        const assigneeEmail = ticket.originalAssignedTo || ticket.assignedTo?.email;
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

        // Add system comment noting the attachment upload
        const uploaderName = accounts[0].name || accounts[0].username;
        const commentText = `Attachment uploaded: ${attachment.name}`;
        const newComment = await addComment(client, parseInt(ticket.id), commentText, true);
        setComments((prev) => [...prev, newComment]);

        // Log the upload activity
        logActivity(client, {
          eventType: "comment_added",
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
          actor: accounts[0].username,
          actorName: uploaderName,
          description: `Attachment uploaded: ${attachment.name}`,
        }).catch((e) => console.error("Failed to log attachment upload:", e));

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

  // Handle merge complete - re-fetch ticket and comments
  const handleMergeComplete = async () => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const updatedTicket = await getTicket(client, ticket.id);
      onUpdate(updatedTicket);
      const ticketComments = await getComments(client, parseInt(ticket.id));
      setComments(ticketComments);
    } catch (e) {
      console.error("Failed to refresh after merge:", e);
    }
  };

  // Handle requesting approval
  const handleRequestApproval = async () => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const requesterName = accounts[0].name || accounts[0].username;
    const requesterEmail = accounts[0].username;

    // Update ticket status to Pending
    const updatedTicket = await requestApproval(client, ticket.id, requesterName, requesterEmail);
    onUpdate(updatedTicket);

    // Log approval request
    logActivity(client, {
      eventType: "approval_requested",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: requesterEmail,
      actorName: requesterName,
      description: `Approval requested by ${requesterName}`,
      details: JSON.stringify({
        ticketTitle: ticket.title,
        ticketStatus: updatedTicket.status,
      }),
    }).catch((e) => console.error("Failed to log approval request:", e));

    // Send email notifications to managers
    await sendApprovalRequestEmail(client, updatedTicket, requesterName);

    // Add internal note about approval request
    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      `📋 Approval requested by ${requesterName}`,
      true
    );
    setComments((prev) => [...prev, approvalComment]);
  };

  // Handle approval decision
  const handleApprovalDecision = async (
    decision: "Approved" | "Denied" | "Changes Requested" | "Approved with Changes" | "Approved & Ordered",
    notes?: string
  ) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const approverName = accounts[0].name || accounts[0].username;
    const approverEmail = accounts[0].username;

    // Process the approval decision
    const updatedTicket = await processApprovalDecision(
      client,
      ticket.id,
      decision,
      approverName,
      approverEmail,
      notes,
      ticket.isPurchaseRequest || false
    );
    onUpdate(updatedTicket);

    // Log the approval decision
    const eventType = decision === "Approved" ? "approval_approved" : "approval_rejected";
    logActivity(client, {
      eventType,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: approverEmail,
      actorName: approverName,
      description: `Ticket ${decision.toLowerCase()} by ${approverName}`,
      details: JSON.stringify({
        decision,
        notes: notes || null,
        requestedBy: ticket.approvalRequestedBy?.displayName || null,
      }),
    }).catch((e) => console.error("Failed to log approval decision:", e));

    // Add internal note about the decision
    const noteText = notes
      ? `**${decision}** by ${approverName}\n\nNotes: ${notes}`
      : `**${decision}** by ${approverName}`;

    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      `📋 ${noteText}`,
      true
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

    // For purchase requests, notify the purchaser group when approved
    if (ticket.isPurchaseRequest && (decision === "Approved" || decision === "Approved with Changes")) {
      sendPurchaseApprovedEmail(client, updatedTicket, approverName)
        .catch((e) => console.error("Failed to send purchase approved email:", e));
    }

    // Send Teams notification after approval for purchase requests
    // (purchase requests skip the Teams notification at creation time)
    if (ticket.isPurchaseRequest && (decision === "Approved" || decision === "Approved with Changes" || decision === "Approved & Ordered")) {
      sendNewTicketTeamsNotification(client, updatedTicket, { force: true });
    }
  };

  // Handle marking a purchase request as purchased
  const handleMarkPurchased = async (data: {
    vendor: string;
    confirmationNum: string;
    actualCost: number;
    expectedDelivery: string;
    notes?: string;
  }) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const purchaserEmail = accounts[0].username;
    const purchaserName = accounts[0].name || accounts[0].username;

    const updatedTicket = await updatePurchaseFields(client, ticket.id, {
      PurchaseStatus: "Purchased",
      PurchaseVendor: data.vendor,
      PurchaseConfirmationNum: data.confirmationNum,
      PurchaseActualCost: data.actualCost,
      PurchaseExpectedDelivery: data.expectedDelivery,
      PurchaseNotes: data.notes,
      PurchasedDate: new Date().toISOString(),
      PurchasedByEmail: purchaserEmail,
    });
    onUpdate(updatedTicket);

    // Log activity
    logActivity(client, {
      eventType: "purchase_ordered",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: purchaserEmail,
      actorName: purchaserName,
      description: `Marked as purchased from ${data.vendor} (${data.confirmationNum})`,
      details: JSON.stringify({
        vendor: data.vendor,
        confirmationNum: data.confirmationNum,
        actualCost: data.actualCost,
        expectedDelivery: data.expectedDelivery,
      }),
    }).catch((e) => console.error("Failed to log purchase activity:", e));

    // Add internal comment
    const commentText = `**Purchased** by ${purchaserName}\n\nVendor: ${data.vendor}\nConfirmation #: ${data.confirmationNum}\nActual Cost: $${data.actualCost.toFixed(2)}\nExpected Delivery: ${data.expectedDelivery}${data.notes ? `\nNotes: ${data.notes}` : ""}`;
    const purchaseComment = await addComment(client, parseInt(ticket.id), commentText, true);
    setComments((prev) => [...prev, purchaseComment]);

    // Send email notification to inventory team
    sendPurchaseOrderedEmail(client, updatedTicket, purchaserName)
      .catch((e) => console.error("Failed to send purchase ordered email:", e));
  };

  // Handle marking a purchase as received
  const handleMarkReceived = async (data: {
    receivedDate: string;
    notes?: string;
  }) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const receiverEmail = accounts[0].username;
    const receiverName = accounts[0].name || accounts[0].username;

    const updatedTicket = await updatePurchaseFields(client, ticket.id, {
      PurchaseStatus: "Received",
      ReceivedDate: data.receivedDate,
      ReceivedNotes: data.notes,
      ReceivedByEmail: receiverEmail,
    });
    onUpdate(updatedTicket);

    // Log activity
    logActivity(client, {
      eventType: "purchase_received",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: receiverEmail,
      actorName: receiverName,
      description: `Marked as received on ${data.receivedDate}`,
      details: JSON.stringify({
        receivedDate: data.receivedDate,
        notes: data.notes || null,
      }),
    }).catch((e) => console.error("Failed to log receive activity:", e));

    // Add internal comment
    const commentText = `**Received** by ${receiverName} on ${data.receivedDate}${data.notes ? `\nNotes: ${data.notes}` : ""}`;
    const receiveComment = await addComment(client, parseInt(ticket.id), commentText, true);
    setComments((prev) => [...prev, receiveComment]);

    // Send email notification to the original requester
    sendPurchaseReceivedEmail(client, updatedTicket, receiverName)
      .catch((e) => console.error("Failed to send purchase received email:", e));
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
            {/* Nudge button for keyword-matched users viewing pending requests */}
            {permissions.visibilityKeywordMatch &&
              ticket.category === "Request" &&
              ticket.approvalStatus === "Pending" && (
                <div className="mt-2">
                  <NudgeApprovalButton ticket={ticket} />
                </div>
              )}
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
              onMarkPurchased={handleMarkPurchased}
              onMarkReceived={handleMarkReceived}
              attachments={attachments}
              attachmentsLoading={attachmentsLoading}
              onUploadAttachment={handleUploadAttachment}
              onDeleteAttachment={handleDeleteAttachment}
              onDownloadAttachment={handleDownloadAttachment}
              onMergeComplete={handleMergeComplete}
              saveRef={detailsPanelSaveRef}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
