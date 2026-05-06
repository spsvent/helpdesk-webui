"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment, Attachment, PurchaseLineItem } from "@/types/ticket";
import {
  getGraphClient,
  getComments,
  addComment,
  getTicket,
  requestApproval,
  processApprovalDecision,
  updateTicketLineItems,
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
  getGeneralManagerMembers,
} from "@/lib/emailService";
import { sendEmail } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import { sendNewTicketTeamsNotification } from "@/lib/teamsService";
import { syncCommentAdded } from "@/lib/vikunjaSyncService";
import { allItemsOrdered, allItemsReceived } from "@/lib/lineItemHelpers";
import ConversationThread from "./ConversationThread";
import DetailsPanel from "./DetailsPanel";
import CommentInput from "./CommentInput";
import ApprovalStatusBadge from "./ApprovalStatusBadge";
import NudgeApprovalButton from "./NudgeApprovalButton";
import ApprovalActionPanel from "./ApprovalActionPanel";

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
  const { canEdit, canComment, isOwn, canApprove, permissions } = useRBAC();
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

  // Re-fetch the ticket itself when a new ticket is selected. Guards
  // against showing days-old React state when a user opens a ticket
  // they previously had loaded. The cancelled flag prevents a slow
  // fetch from clobbering state if the user clicks a different ticket
  // before this one resolves.
  useEffect(() => {
    if (!accounts[0]) return;
    let cancelled = false;
    const ticketIdAtFetch = ticket.id;

    (async () => {
      try {
        const client = getGraphClient(instance, accounts[0]);
        const fresh = await getTicket(client, ticketIdAtFetch);
        if (!cancelled) onUpdate(fresh);
      } catch (e) {
        if (!cancelled) console.error("Failed to refresh ticket on open:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally depend only on ticket.id — onUpdate identity changes
    // would re-trigger the fetch unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Sync comment to Vikunja (fire-and-forget, Tech tickets only)
      syncCommentAdded(ticket, text, isInternal, commenterName, commenterEmail);
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
        const sizeStr = attachment.size > 0
          ? ` (${attachment.size < 1024 ? attachment.size + " B" : attachment.size < 1048576 ? (attachment.size / 1024).toFixed(1) + " KB" : (attachment.size / 1048576).toFixed(1) + " MB"})`
          : "";
        const commentText = `[System] Attachment uploaded: ${attachment.name}${sizeStr} — available in the Attachments section above.`;
        const newComment = await addComment(client, parseInt(ticket.id), commentText, true);
        setComments((prev) => [...prev, newComment]);

        // Log the upload activity
        logActivity(client, {
          eventType: "comment_added",
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
          actor: accounts[0].username,
          actorName: accounts[0].name || accounts[0].username,
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
    notes?: string,
    options?: { keptItems?: PurchaseLineItem[]; orderItems?: PurchaseLineItem[] },
  ) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const approverName = accounts[0].name || accounts[0].username;
    const approverEmail = accounts[0].username;

    // Process the approval decision — throws if the status didn't save
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

    // If GM removed items via the checklist on "Approve with Changes", rewrite
    // line items now and log the change. Skip if no kept items array passed
    // (e.g. plain Approve, Deny, etc.).
    if (options?.keptItems && options.keptItems.length > 0 && ticket.purchaseLineItems) {
      const removedItems = ticket.purchaseLineItems.filter(
        (originalItem) => !options.keptItems!.includes(originalItem)
      );
      const further = await updateTicketLineItems(client, ticket.id, options.keptItems);
      onUpdate(further);
      logActivity(client, {
        eventType: "purchase_items_changed",
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
        actor: approverEmail,
        actorName: approverName,
        description: `Items modified during approval by ${approverName}`,
        details: JSON.stringify({
          removed: removedItems,
          kept: options.keptItems,
        }),
      }).catch((e) => console.error("Failed to log items change:", e));
    }

    // If GM filled per-item order details on "Approve & Order", write them
    // and flip status to Ordered if every item is fully filled.
    if (options?.orderItems && options.orderItems.length > 0) {
      const newStatus = allItemsOrdered(options.orderItems) ? "Ordered" : "Approved";
      const further = await updateTicketLineItems(client, ticket.id, options.orderItems, {
        purchaseStatus: newStatus,
      });
      onUpdate(further);
    }

    // Only log, comment, and notify AFTER the status has been verified saved
    logActivity(client, {
      eventType: decision === "Approved" ? "approval_approved" : "approval_rejected",
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

    // Notify approval requester + ticket requester + assignee (deduped, excluding the approver)
    const decisionRecipients = new Set<string>();
    const approvalRequesterEmail = updatedTicket.approvalRequestedBy?.email || ticket.approvalRequestedBy?.email;
    if (approvalRequesterEmail) decisionRecipients.add(approvalRequesterEmail.toLowerCase());
    if (ticket.requester?.email) decisionRecipients.add(ticket.requester.email.toLowerCase());
    if (ticket.assignedTo?.email) decisionRecipients.add(ticket.assignedTo.email.toLowerCase());
    decisionRecipients.delete(approverEmail.toLowerCase()); // Don't notify the person who made the decision

    const emailPromises = Array.from(decisionRecipients).map((email) =>
      sendDecisionEmail(client, updatedTicket, decision, approverName, email, notes)
        .catch((e) => console.error(`Failed to send decision email to ${email}:`, e))
    );
    await Promise.all(emailPromises);

    if (ticket.isPurchaseRequest && (decision === "Approved" || decision === "Approved with Changes")) {
      sendPurchaseApprovedEmail(client, updatedTicket, approverName)
        .catch((e) => console.error("Failed to send purchase approved email:", e));
    }

    // For "Approve & Ordered", the GM is purchasing themselves — alert the
    // inventory team (who will receive the items) and other GMs (FYI). The
    // requester is already covered by sendDecisionEmail above.
    if (ticket.isPurchaseRequest && decision === "Approved & Ordered") {
      sendPurchaseOrderedEmail(client, updatedTicket, approverName)
        .catch((e) => console.error("Failed to send purchase ordered email to inventory:", e));
      // Alert other GMs (excluding the approver) that the order was placed
      try {
        const gms = await getGeneralManagerMembers(client);
        const subject = `[Order Placed] Ticket #${updatedTicket.ticketNumber || updatedTicket.id}: ${updatedTicket.title}`;
        const body = `<p>${approverName} approved this purchase request and placed the order directly.</p>
          <p>View ticket: <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}?ticket=${updatedTicket.id}">#${updatedTicket.ticketNumber || updatedTicket.id}</a></p>`;
        await Promise.all(
          gms
            .filter((m) => m.email.toLowerCase() !== approverEmail.toLowerCase())
            .map((m) =>
              sendEmail(client, m.email, subject, body, `ticket-${updatedTicket.id}`).catch(
                (e) => console.error(`Failed to alert GM ${m.email}:`, e),
              ),
            ),
        );
      } catch (e) {
        console.error("Failed to alert GMs of order placement:", e);
      }
    }

    if (ticket.isPurchaseRequest && (decision === "Approved" || decision === "Approved with Changes" || decision === "Approved & Ordered")) {
      sendNewTicketTeamsNotification(client, updatedTicket, { force: true });
    }
  };

  // Handle marking a purchase request as purchased
  const handleMarkPurchased = async (orderItems: PurchaseLineItem[], notes?: string) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const purchaserEmail = accounts[0].username;
    const purchaserName = accounts[0].name || accounts[0].username;

    const allOrdered = allItemsOrdered(orderItems);
    const newStatus = allOrdered ? "Ordered" : "Approved";

    const updatedTicket = await updateTicketLineItems(client, ticket.id, orderItems, {
      purchaseStatus: newStatus,
      notes,
    });
    onUpdate(updatedTicket);

    // Log activity with per-item data
    const vendorSummary = Array.from(new Set(orderItems.map((i) => i.vendor).filter(Boolean))).join(", ");
    logActivity(client, {
      eventType: "purchase_ordered",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: purchaserEmail,
      actorName: purchaserName,
      description: `Marked as purchased: ${orderItems.length} item${orderItems.length === 1 ? "" : "s"} from ${vendorSummary || "unspecified vendor"}`,
      details: JSON.stringify({ orderItems }),
    }).catch((e) => console.error("Failed to log purchase activity:", e));

    // Internal comment summarizing the order
    const itemLines = orderItems
      .map((it, idx) => `  ${idx + 1}. ${it.name || it.url || "item"} ×${it.qty} — ${it.vendor ?? "?"} (${it.orderNum ?? "?"})`)
      .join("\n");
    const commentText = `**Purchased** by ${purchaserName}\n\n${itemLines}${notes ? `\n\nNotes: ${notes}` : ""}`;
    const purchaseComment = await addComment(client, parseInt(ticket.id), commentText, true);
    setComments((prev) => [...prev, purchaseComment]);

    // Send email to inventory team
    sendPurchaseOrderedEmail(client, updatedTicket, purchaserName)
      .catch((e) => console.error("Failed to send purchase ordered email:", e));
  };

  // Handle marking a purchase as received (per-item)
  const handleMarkReceived = async (receivedItems: PurchaseLineItem[], notes?: string) => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const receiverEmail = accounts[0].username;
    const receiverName = accounts[0].name || accounts[0].username;

    const allReceived = allItemsReceived(receivedItems);
    const newStatus = allReceived ? "Received" : "Ordered";

    const updatedTicket = await updateTicketLineItems(client, ticket.id, receivedItems, {
      purchaseStatus: newStatus,
      notes,
    });
    onUpdate(updatedTicket);

    // Log activity with per-item received data
    logActivity(client, {
      eventType: "purchase_received",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: receiverEmail,
      actorName: receiverName,
      description: allReceived
        ? `All ${receivedItems.length} item${receivedItems.length === 1 ? "" : "s"} received`
        : `Partial receipt: ${receivedItems.filter((i) => (i.receivedQty ?? 0) > 0).length} of ${receivedItems.length} items`,
      details: JSON.stringify({ receivedItems }),
    }).catch((e) => console.error("Failed to log receive activity:", e));

    // Internal comment summarizing receipt
    const itemLines = receivedItems
      .map(
        (it, idx) =>
          `  ${idx + 1}. ${it.name || it.url || "item"}: received ${it.receivedQty ?? 0}/${it.qty} on ${it.receivedDate ?? "-"}`,
      )
      .join("\n");
    const commentText = `**${allReceived ? "All Received" : "Partial Receipt"}** by ${receiverName}\n\n${itemLines}${notes ? `\n\nNotes: ${notes}` : ""}`;
    const receiveComment = await addComment(client, parseInt(ticket.id), commentText, true);
    setComments((prev) => [...prev, receiveComment]);

    // Email original requester only when fully received (avoid noise on partials)
    if (allReceived) {
      sendPurchaseReceivedEmail(client, updatedTicket, receiverName).catch((e) =>
        console.error("Failed to send purchase received email:", e),
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
              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                ticket.isPurchaseRequest
                  ? "bg-purple-100 text-purple-700"
                  : ticket.category === "Problem"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-sky-100 text-sky-700"
              }`}>
                {ticket.isPurchaseRequest ? "Purchase Request" : ticket.category}
              </span>
              {ticket.location && (
                <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-600">
                  {ticket.location}
                </span>
              )}
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
              {/* Approval action banner — shown above conversation when approval is pending */}
              {ticket.approvalStatus === "Pending" && canApprove() && (
                <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                  <ApprovalActionPanel
                    ticket={ticket}
                    isPurchaseRequest={ticket.isPurchaseRequest || false}
                    onDecision={handleApprovalDecision}
                  />
                </div>
              )}

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
