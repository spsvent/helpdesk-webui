"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Attachment, PurchaseLineItem, Comment } from "@/types/ticket";
import { collectParticipants } from "@/lib/participants";
import { ensureFreshToken } from "@/lib/authActions";
import { saveDraft, loadDraft, clearDraft } from "@/lib/formDraft";
import { graphScopes } from "@/lib/msalConfig";
import {
  getGraphClient,
  updateTicketFields,
  getUserByEmail,
  addAssignmentComment,
  logActivity,
  OrgUser,
} from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import {
  getProblemTypes,
  getProblemTypeSubs,
  getProblemTypeSub2s,
  hasSubCategories,
  hasSub2Categories,
} from "@/lib/categoryConfig";
import { getSuggestedAssignee } from "@/lib/autoAssignConfig";
import { fetchAutoAssignConfig, getSuggestedAssigneeFromConfig } from "@/lib/autoAssignConfigService";
import { shouldClearApprovalOnConversion, isProblemConversionBlocked } from "@/lib/approvalFlow";
import UserAvatar from "./UserAvatar";
import UserSearchDropdown from "./UserSearchDropdown";
import ParticipantsPanel from "./ParticipantsPanel";
import RequestApprovalButton from "./RequestApprovalButton";
import ConvertToPurchaseButton from "@/modules/purchase/components/ConvertToPurchaseButton";
import ApprovalHistory from "./ApprovalHistory";
import AttachmentList from "./AttachmentList";
import AttachmentUpload from "./AttachmentUpload";
import MergeTicketPanel from "./MergeTicketPanel";
import PurchaseStatusBadge from "./PurchaseStatusBadge";
import PurchaseActionPanel from "./PurchaseActionPanel";
import ReceiveActionPanel from "./ReceiveActionPanel";
import LineItemsTable from "./LineItemsTable";
import { formatDateTime } from "@/lib/dateUtils";
import { sendAssignmentEmail, sendStatusChangeEmail } from "@/lib/emailService";
import { PurchaseStatus } from "@/types/ticket";
import {
  sendStatusChangeTeamsNotification,
  sendPriorityEscalationTeamsNotification,
} from "@/lib/teamsService";
import { syncTicketUpdated, syncTicketRecategorized } from "@/lib/vikunjaSyncService";

interface DetailsPanelProps {
  ticket: Ticket;
  onUpdate: (ticket: Ticket) => void;
  comments?: Comment[];
  canEdit?: boolean;
  onRequestApproval?: () => Promise<void>;
  // Purchase workflow
  onMarkPurchased?: (orderItems: PurchaseLineItem[], notes?: string) => Promise<void>;
  onMarkReceived?: (receivedItems: PurchaseLineItem[], notes?: string) => Promise<void>;
  // Attachments
  attachments: Attachment[];
  attachmentsLoading?: boolean;
  onUploadAttachment?: (file: File) => Promise<boolean>;
  onDeleteAttachment?: (filename: string) => Promise<void>;
  onDownloadAttachment?: (filename: string) => Promise<void>;
  onPreviewImage?: (filename: string) => void;
  /** Downloads (once, cached) an attachment and returns an object URL — powers 40×40 image thumbs. */
  getAttachmentPreviewUrl?: (name: string) => Promise<string | null>;
  // Ref to the Attachments section so comment links can scroll to it
  attachmentsSectionRef?: React.RefObject<HTMLDivElement>;
  // Briefly highlight the Attachments section after a scroll-to
  highlightAttachments?: boolean;
  // Merge
  onMergeComplete?: () => void;
  // Expose save functionality to parent (for Post Comment to also save)
  saveRef?: React.MutableRefObject<{ save: () => Promise<void>; hasChanges: boolean } | null>;
}

const STATUS_OPTIONS: Ticket["status"][] = [
  "New",
  "In Progress",
  "On Hold",
  "Resolved",
];

const PRIORITY_OPTIONS: Ticket["priority"][] = ["Low", "Normal", "High", "Urgent"];
const CATEGORY_OPTIONS: Ticket["category"][] = ["Request", "Problem"];

export default function DetailsPanel({
  ticket,
  onUpdate,
  comments = [],
  canEdit = true,
  onRequestApproval,
  onMarkPurchased,
  onMarkReceived,
  attachments,
  attachmentsLoading = false,
  onUploadAttachment,
  onDeleteAttachment,
  onDownloadAttachment,
  onPreviewImage,
  getAttachmentPreviewUrl,
  attachmentsSectionRef,
  highlightAttachments = false,
  onMergeComplete,
  saveRef,
}: DetailsPanelProps) {
  const { instance, accounts } = useMsal();
  const { canRequestApproval, canApprove, canPurchaseTicket, canReceiveTicket, permissions } = useRBAC();
  const isAdmin = permissions?.role === "admin";

  // Basic fields (support staff can edit)
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);

  // Admin-only editable fields
  const [category, setCategory] = useState(ticket.category);
  const [problemType, setProblemType] = useState(ticket.problemType);
  const [problemTypeSub, setProblemTypeSub] = useState(ticket.problemTypeSub || "");
  const [problemTypeSub2, setProblemTypeSub2] = useState(ticket.problemTypeSub2 || "");
  // Initialize assignee from either the Person field or OriginalAssignedTo text field
  const [selectedAssignee, setSelectedAssignee] = useState<{ displayName: string; email: string } | null>(
    ticket.assignedTo ? {
      displayName: ticket.originalAssignedTo?.split('<')[0].trim() || ticket.assignedTo.displayName,
      email: ticket.assignedTo.email || ticket.originalAssignedTo || "",
    } : ticket.originalAssignedTo ? {
      // Fallback to originalAssignedTo when Person field is empty (auto-assigned tickets)
      displayName: ticket.originalAssignedTo.includes('@')
        ? ticket.originalAssignedTo.split('@')[0].replace(/[._]/g, ' ')
        : ticket.originalAssignedTo,
      email: ticket.originalAssignedTo,
    } : null
  );

  // Cascading dropdown options
  const [problemTypeSubs, setProblemTypeSubs] = useState<string[]>([]);
  const [problemTypeSub2s, setProblemTypeSub2s] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Restore an edits draft snapshotted before a renewal redirect, then clear it (one-shot).
  // Setting the fields re-triggers the hasChanges effect, so Save re-arms automatically.
  useEffect(() => {
    const d = loadDraft<{ status: Ticket["status"]; priority: Ticket["priority"]; category: Ticket["category"]; problemType: string; problemTypeSub: string; problemTypeSub2: string; assigneeEmail?: string }>(`details:${ticket.id}`);
    if (d) {
      setStatus(d.status);
      setPriority(d.priority);
      setCategory(d.category);
      setProblemType(d.problemType);
      setProblemTypeSub(d.problemTypeSub);
      setProblemTypeSub2(d.problemTypeSub2);
      if (d.assigneeEmail) setSelectedAssignee({ displayName: d.assigneeEmail, email: d.assigneeEmail });
      clearDraft(`details:${ticket.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [autoAssignSuggestion, setAutoAssignSuggestion] = useState<string | null>(null);

  // Reset all local state when ticket changes (e.g., user selects a different ticket)
  useEffect(() => {
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setCategory(ticket.category);
    setProblemType(ticket.problemType);
    setProblemTypeSub(ticket.problemTypeSub || "");
    setProblemTypeSub2(ticket.problemTypeSub2 || "");
    setSelectedAssignee(
      ticket.assignedTo ? {
        displayName: ticket.originalAssignedTo?.split('<')[0].trim() || ticket.assignedTo.displayName,
        email: ticket.assignedTo.email || ticket.originalAssignedTo || "",
      } : ticket.originalAssignedTo ? {
        displayName: ticket.originalAssignedTo.includes('@')
          ? ticket.originalAssignedTo.split('@')[0].replace(/[._]/g, ' ')
          : ticket.originalAssignedTo,
        email: ticket.originalAssignedTo,
      } : null
    );
    setHasChanges(false);
    setAutoAssignSuggestion(null);
  }, [ticket.id]);

  // Update sub-category options when problemType changes
  useEffect(() => {
    const subs = getProblemTypeSubs(problemType);
    setProblemTypeSubs(subs);
  }, [problemType]);

  // Update sub2 options when problemTypeSub changes
  useEffect(() => {
    if (problemType && problemTypeSub) {
      const sub2s = getProblemTypeSub2s(problemType, problemTypeSub);
      setProblemTypeSub2s(sub2s);
    } else {
      setProblemTypeSub2s([]);
    }
  }, [problemType, problemTypeSub]);

  // Check for changes
  // Track changes - only depend on specific ticket fields that are compared
  const ticketStatus = ticket.status;
  const ticketPriority = ticket.priority;
  const ticketCategory = ticket.category;
  const ticketProblemType = ticket.problemType;
  const ticketProblemTypeSub = ticket.problemTypeSub || "";
  const ticketProblemTypeSub2 = ticket.problemTypeSub2 || "";
  const ticketAssigneeEmail = ticket.originalAssignedTo || ticket.assignedTo?.email || "";

  useEffect(() => {
    const basicChanges =
      status !== ticketStatus ||
      priority !== ticketPriority;

    // Compare assignee email to detect changes
    const assigneeChanged = (selectedAssignee?.email || "") !== ticketAssigneeEmail;

    const adminChanges = isAdmin && (
      category !== ticketCategory ||
      problemType !== ticketProblemType ||
      problemTypeSub !== ticketProblemTypeSub ||
      problemTypeSub2 !== ticketProblemTypeSub2 ||
      assigneeChanged
    );

    setHasChanges(basicChanges || !!adminChanges);
  }, [status, priority, category, problemType, problemTypeSub, problemTypeSub2, selectedAssignee,
      ticketStatus, ticketPriority, ticketCategory, ticketProblemType, ticketProblemTypeSub,
      ticketProblemTypeSub2, ticketAssigneeEmail, isAdmin]);

  // Auto-assign when department changes
  useEffect(() => {
    if (isAdmin && problemType !== ticket.problemType) {
      const applyAutoAssignment = async () => {
        if (!accounts[0]) return;

        let suggestion: string | null = null;

        // First try SharePoint rules
        try {
          const client = getGraphClient(instance, accounts[0]);
          const autoAssignConfig = await fetchAutoAssignConfig(client);
          if (autoAssignConfig.rules.length > 0) {
            suggestion = getSuggestedAssigneeFromConfig(
              autoAssignConfig,
              problemType,
              problemTypeSub || undefined,
              problemTypeSub2 || undefined,
              category,
              priority
            );
          }
        } catch (configError) {
          console.warn("Failed to fetch SharePoint auto-assign config:", configError);
        }

        // Fall back to hardcoded rules
        if (!suggestion) {
          suggestion = getSuggestedAssignee(
            problemType,
            problemTypeSub || undefined,
            problemTypeSub2 || undefined,
            category
          );
        }

        if (suggestion) {
          setAutoAssignSuggestion(suggestion);
          try {
            const client = getGraphClient(instance, accounts[0]);
            const user = await getUserByEmail(client, suggestion);
            if (user) {
              setSelectedAssignee({ displayName: user.displayName, email: user.email });
            }
          } catch (error) {
            console.error("Failed to lookup suggested assignee:", error);
          }
        } else {
          setAutoAssignSuggestion(null);
        }
      };
      applyAutoAssignment();
    } else {
      setAutoAssignSuggestion(null);
    }
  }, [problemType, problemTypeSub, problemTypeSub2, category, priority, ticket.problemType, isAdmin, accounts, instance]);

  const handleStatusChange = (newStatus: Ticket["status"]) => {
    setStatus(newStatus);
  };

  const handlePriorityChange = (newPriority: Ticket["priority"]) => {
    setPriority(newPriority);
  };

  const handleCategoryChange = (newCategory: Ticket["category"]) => {
    setCategory(newCategory);
  };

  const handleProblemTypeChange = (newProblemType: string) => {
    setProblemType(newProblemType);
    // Reset sub-categories when parent changes
    const subs = getProblemTypeSubs(newProblemType);
    setProblemTypeSub(subs.length > 0 ? subs[0] : "");
    setProblemTypeSub2("");
  };

  const handleProblemTypeSubChange = (newSub: string) => {
    setProblemTypeSub(newSub);
    setProblemTypeSub2("");
  };

  const handleAssigneeChange = (user: OrgUser | null) => {
    if (user) {
      setSelectedAssignee({ displayName: user.displayName, email: user.email });
    } else {
      setSelectedAssignee(null);
    }
  };


  const handleSave = async () => {
    if (!accounts[0] || !hasChanges) return;

    setSaving(true);
    const currentUserName = accounts[0].name || accounts[0].username;
    const oldStatus = ticket.status;
    const oldPriority = ticket.priority;
    const oldCategory = ticket.category;
    const oldAssigneeEmail = ticket.originalAssignedTo || ticket.assignedTo?.email;

    // Purchase requests can't be reclassified as Problems — they run their own
    // purchase workflow. The category dropdown disables that option, but guard
    // the write too so the conversion can't slip through.
    const effectiveCategory = isProblemConversionBlocked(ticket, category)
      ? oldCategory
      : category;

    try {
      // Pre-flight: snapshot the edits so a renewal redirect doesn't lose them.
      const tokenOk = await ensureFreshToken(instance, accounts[0], graphScopes, {
        onBeforeRedirect: () => saveDraft(`details:${ticket.id}`, {
          status, priority, category, problemType, problemTypeSub, problemTypeSub2,
          assigneeEmail: selectedAssignee?.email,
        }),
      });
      if (!tokenOk) { setSaving(false); return; }

      const client = getGraphClient(instance, accounts[0]);

      // Build updates object
      const updates: Parameters<typeof updateTicketFields>[2] = {
        Status: status,
        Priority: priority,
      };

      // Add admin-only fields if user is admin
      if (isAdmin) {
        updates.Category = effectiveCategory;
        updates.ProblemType = problemType;
        updates.ProblemTypeSub = problemTypeSub || undefined;
        updates.ProblemTypeSub2 = problemTypeSub2 || undefined;

        // Converting a Request that's awaiting a decision into a Problem removes
        // it from the approval flow (a Problem never needs approval). Terminal
        // Approved/Denied records are left intact as history.
        if (shouldClearApprovalOnConversion(oldCategory, effectiveCategory, ticket.approvalStatus)) {
          updates.ApprovalStatus = "None";
        }

        // Handle assignee change - update OriginalAssignedTo field
        const currentAssigneeEmail = ticket.originalAssignedTo || ticket.assignedTo?.email;
        if (selectedAssignee?.email !== currentAssigneeEmail) {
          updates.OriginalAssignedTo = selectedAssignee?.email || "";
        }
      }

      const updated = await updateTicketFields(client, ticket.id, updates);
      onUpdate(updated);
      setHasChanges(false);
      setAutoAssignSuggestion(null);

      // Log activity for changes (don't block on these)
      const ticketNumber = ticket.ticketNumber?.toString() || ticket.id;

      // Log status change
      if (status !== oldStatus) {
        logActivity(client, {
          eventType: "ticket_status_changed",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Status changed from "${oldStatus}" to "${status}"`,
          details: JSON.stringify({ oldStatus, newStatus: status }),
        }).catch((e) => console.error("Failed to log status change:", e));
      }

      // Log priority change
      if (priority !== oldPriority) {
        logActivity(client, {
          eventType: "ticket_priority_changed",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Priority changed from "${oldPriority}" to "${priority}"`,
          details: JSON.stringify({ oldPriority, newPriority: priority }),
        }).catch((e) => console.error("Failed to log priority change:", e));
      }

      // Log category conversion (and note when it cleared a pending approval)
      if (isAdmin && effectiveCategory !== oldCategory) {
        const clearedApproval = updates.ApprovalStatus === "None";
        logActivity(client, {
          eventType: "ticket_converted",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Category changed from "${oldCategory}" to "${effectiveCategory}"${clearedApproval ? " — pending approval cleared" : ""}`,
          details: JSON.stringify({ oldCategory, newCategory: effectiveCategory, clearedApproval }),
        }).catch((e) => console.error("Failed to log category conversion:", e));
      }

      // Log assignment change
      if (selectedAssignee?.email && selectedAssignee.email !== oldAssigneeEmail) {
        const oldAssigneeName = ticket.assignedTo?.displayName ||
          (oldAssigneeEmail ? oldAssigneeEmail.split('@')[0].replace(/[._]/g, ' ') : "Unassigned");
        logActivity(client, {
          eventType: "ticket_assigned",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Assigned to ${selectedAssignee.displayName}`,
          details: JSON.stringify({
            oldAssignee: oldAssigneeName,
            oldAssigneeEmail: oldAssigneeEmail || null,
            newAssignee: selectedAssignee.displayName,
            newAssigneeEmail: selectedAssignee.email,
          }),
        }).catch((e) => console.error("Failed to log assignment change:", e));
      }

      // Send email notifications (don't block on these)
      // Notify new assignee if assignment changed
      if (selectedAssignee?.email && selectedAssignee.email !== oldAssigneeEmail) {
        sendAssignmentEmail(
          client,
          updated,
          selectedAssignee.email,
          selectedAssignee.displayName,
          currentUserName
        ).then(() => {
          // Log successful email
          logActivity(client, {
            eventType: "email_sent",
            ticketId: ticket.id,
            ticketNumber,
            actor: accounts[0].username,
            actorName: currentUserName,
            description: `Assignment notification sent to ${selectedAssignee.displayName}`,
            details: JSON.stringify({
              emailType: "assignment_notification",
              recipient: selectedAssignee.email,
              recipientName: selectedAssignee.displayName,
            }),
          }).catch((e) => console.error("Failed to log email sent:", e));
        }).catch((e) => console.error("Failed to send assignment email:", e));

        // Add assignment tracking comment
        const oldAssigneeName = ticket.assignedTo?.displayName ||
          (oldAssigneeEmail ? oldAssigneeEmail.split('@')[0].replace(/[._]/g, ' ') : undefined);
        addAssignmentComment(
          client,
          parseInt(ticket.id),
          currentUserName,
          selectedAssignee.displayName,
          selectedAssignee.email,
          oldAssigneeName
        ).catch((e) => console.error("Failed to add assignment comment:", e));
      }

      // Notify all participants if status changed (email)
      if (status !== oldStatus) {
        const participants = collectParticipants(
          {
            requesterEmail: ticket.requester.email,
            assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
            approverEmail: ticket.approvedBy?.email,
            approvalRequesterEmail: ticket.approvalRequestedBy?.email,
            manualEmails: ticket.participantEmails,
            commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
          },
          accounts[0].username
        );
        participants.forEach((email) =>
          sendStatusChangeEmail(client, updated, email, oldStatus, currentUserName).catch((e) =>
            console.error(`Failed to send status change email to ${email}:`, e)
          )
        );
        logActivity(client, {
          eventType: "email_sent",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Status change notification sent to ${participants.length} participant(s)`,
          details: JSON.stringify({ emailType: "status_change_notification", recipients: participants, oldStatus, newStatus: status }),
        }).catch((e) => console.error("Failed to log email sent:", e));
      }

      // Send Teams notification for status change (independent of email)
      if (status !== oldStatus) {
        sendStatusChangeTeamsNotification(client, updated, oldStatus, currentUserName);
      }

      // Send Teams notification for priority escalation
      if (priority !== oldPriority) {
        sendPriorityEscalationTeamsNotification(client, updated, oldPriority, currentUserName);
      }

      // Sync changes to Vikunja (fire-and-forget, Tech tickets only)
      const changedFields: Record<string, { old: string; new: string }> = {};
      if (status !== oldStatus) {
        changedFields.status = { old: oldStatus, new: status };
      }
      if (priority !== oldPriority) {
        changedFields.priority = { old: oldPriority, new: priority };
      }
      const newAssigneeEmail = selectedAssignee?.email || "";
      if (newAssigneeEmail !== (oldAssigneeEmail || "")) {
        changedFields.assignee = {
          old: ticket.assignedTo?.displayName || oldAssigneeEmail || "",
          new: selectedAssignee?.displayName || newAssigneeEmail,
        };
      }
      if (Object.keys(changedFields).length > 0) {
        syncTicketUpdated(updated, changedFields, currentUserName, accounts[0].username);
      }

      // If the ticket was recategorized away from Tech, pause its Vikunja mapping so the
      // webhook won't keep resolving or mirroring it. Handled separately because the
      // current ticket is no longer Tech, which bypasses the regular sync path.
      if (ticket.problemType === "Tech" && problemType !== "Tech") {
        syncTicketRecategorized(ticket.id, ticket.problemType, problemType);
      }
    } catch (e) {
      console.error("Failed to update ticket:", e);
    } finally {
      setSaving(false);
    }
  };

  const showProblemTypeSub = hasSubCategories(problemType);
  const showProblemTypeSub2 = showProblemTypeSub && hasSub2Categories(problemType, problemTypeSub);

  // Expose save function to parent for Post Comment integration
  // Using assignment in render to always have latest handleSave (no stale closure)
  if (saveRef) {
    saveRef.current = {
      save: handleSave,
      hasChanges,
    };
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text-primary text-sm uppercase tracking-wide">
          Details
        </h2>
        {hasChanges && canEdit && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-brand-blue text-white text-sm rounded-lg font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>

      {/* Approval Section */}
      {(canRequestApproval(ticket) || canApprove() || ticket.approvalStatus !== "None") && (
        <>
          {/* Request Approval Button for Support Staff */}
          {canRequestApproval(ticket) && onRequestApproval && (
            <RequestApprovalButton
              ticket={ticket}
              onRequestApproval={onRequestApproval}
            />
          )}

          {/* Approval History */}
          <ApprovalHistory ticket={ticket} />

          <hr className="border-border" />
        </>
      )}

      {/* Convert to Purchase Request — additive bridge from the purchase module. */}
      {!ticket.isPurchaseRequest && ticket.status !== "Closed" && (
        <>
          <ConvertToPurchaseButton ticketId={ticket.id} />
          <hr className="border-border" />
        </>
      )}

      {/* Merge Ticket */}
      {canEdit && onMergeComplete && (
        <>
          {/* key={ticket.id} remounts the panel when a different ticket is
              selected, resetting its internal flow (incl. the terminal "Merge
              complete" prompt) so it can't linger on the next ticket. Same id
              across background refreshes keeps an in-progress merge intact. */}
          <MergeTicketPanel key={ticket.id} ticket={ticket} onMergeComplete={onMergeComplete} />
          <hr className="border-border" />
        </>
      )}

      {/* Status */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">
          Status
        </label>
        {canEdit ? (
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as Ticket["status"])}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm">{status}</span>
        )}
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">
          Priority
        </label>
        {canEdit ? (
          <select
            value={priority}
            onChange={(e) => handlePriorityChange(e.target.value as Ticket["priority"])}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm">{priority}</span>
        )}
      </div>

      <hr className="border-border" />

      {/* Assignee - Editable by admins */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">
          Assignee
          {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
        </label>
        {isAdmin && canEdit ? (
          <div className="space-y-2">
            <UserSearchDropdown
              value={selectedAssignee}
              onChange={handleAssigneeChange}
              placeholder="Search for a user..."
            />
            {autoAssignSuggestion && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs text-green-700">
                  Auto-assigned based on department
                </span>
              </div>
            )}
          </div>
        ) : selectedAssignee ? (
          <div className="flex items-center gap-2">
            <UserAvatar name={selectedAssignee.displayName} size="sm" />
            <span className="text-sm">{selectedAssignee.displayName}</span>
          </div>
        ) : (
          <span className="text-sm text-text-secondary">Unassigned</span>
        )}
      </div>

      {/* Requester */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">
          Requester
        </label>
        <div className="flex items-center gap-2">
          <UserAvatar name={ticket.originalRequester?.split('<')[0].trim() || ticket.requester.displayName} size="sm" />
          <span className="text-sm">{ticket.originalRequester || ticket.requester.displayName}</span>
        </div>
      </div>

      {/* Participants — manually-added notification audience + auto-discovered recipients */}
      <ParticipantsPanel ticket={ticket} comments={comments} onUpdate={onUpdate} />

      <hr className="border-border" />

      {/* Category - Editable by admins */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Category
          {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
        </label>
        {isAdmin && canEdit ? (
          <>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as Ticket["category"])}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt} disabled={isProblemConversionBlocked(ticket, opt)}>
                  {opt}
                </option>
              ))}
            </select>
            {ticket.isPurchaseRequest && (
              <p className="mt-1 text-xs text-text-secondary">
                Purchase requests can&apos;t be converted to Problems.
              </p>
            )}
          </>
        ) : (
          <span className="text-sm">{category}</span>
        )}
      </div>

      {/* Department (Problem Type) - Editable by admins */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Department
          {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
        </label>
        {isAdmin && canEdit ? (
          <select
            value={problemType}
            onChange={(e) => handleProblemTypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {getProblemTypes().map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm">{problemType}</span>
        )}
      </div>

      {/* Sub-Category - Editable by admins */}
      {(showProblemTypeSub || problemTypeSub) && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Sub-Category
            {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
          </label>
          {isAdmin && canEdit && showProblemTypeSub ? (
            <select
              value={problemTypeSub}
              onChange={(e) => handleProblemTypeSubChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {problemTypeSubs.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm">{problemTypeSub || ticket.problemTypeSub}</span>
          )}
        </div>
      )}

      {/* Specific Type - Editable by admins */}
      {(showProblemTypeSub2 || problemTypeSub2 || ticket.problemTypeSub2) && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Specific Type
            {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
          </label>
          {isAdmin && canEdit && showProblemTypeSub2 ? (
            <select
              value={problemTypeSub2}
              onChange={(e) => setProblemTypeSub2(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="">Select...</option>
              {problemTypeSub2s.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm">{problemTypeSub2 || ticket.problemTypeSub2}</span>
          )}
        </div>
      )}

      {/* Location */}
      {ticket.location && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Location
          </label>
          <span className="text-sm">{ticket.location}</span>
        </div>
      )}

      <hr className="border-border" />

      {/* Dates */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Created
        </label>
        <span className="text-sm">{formatDateTime(ticket.created)}</span>
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Last Updated
        </label>
        <span className="text-sm">{formatDateTime(ticket.modified)}</span>
      </div>

      {ticket.dueDate && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Due Date
          </label>
          <span className="text-sm">{formatDateTime(ticket.dueDate)}</span>
        </div>
      )}

      {/* Purchase Details Section */}
      {ticket.isPurchaseRequest && ticket.purchaseStatus && (
        <>
          <hr className="border-border" />
          <div className="space-y-3">
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-text-primary">Purchase Details</h3>
                <PurchaseStatusBadge status={ticket.purchaseStatus as PurchaseStatus} size="sm" />
              </div>

              {ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
                <LineItemsTable
                  items={ticket.purchaseLineItems}
                  showOrderColumns={ticket.purchaseLineItems.some((i) => i.vendor || i.orderNum)}
                  showReceivedColumns={ticket.purchaseLineItems.some((i) => i.receivedDate)}
                />
              )}

              {ticket.purchaseJustification && (
                <div className="mt-3">
                  <p className="text-xs text-text-secondary uppercase">Justification</p>
                  <p className="text-sm whitespace-pre-wrap">{ticket.purchaseJustification}</p>
                </div>
              )}

              {ticket.purchaseProject && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-text-secondary uppercase">Project</span>
                  <span className="text-sm">{ticket.purchaseProject}</span>
                </div>
              )}
            </div>

            {/* Purchaser action panel */}
            {canPurchaseTicket(ticket) && onMarkPurchased && (
              <PurchaseActionPanel ticket={ticket} onMarkPurchased={onMarkPurchased} />
            )}

            {/* Inventory action panel */}
            {canReceiveTicket(ticket) && onMarkReceived && (
              <ReceiveActionPanel ticket={ticket} onMarkReceived={onMarkReceived} />
            )}
          </div>
        </>
      )}

      <hr className="border-border" />

      {/* Attachments */}
      <div
        ref={attachmentsSectionRef}
        id="ticket-attachments"
        className={`scroll-mt-4 rounded-lg p-2 -mx-2 transition-shadow ${
          highlightAttachments ? "ring-2 ring-brand-blue ring-offset-2" : ""
        }`}
      >
        <label className="block text-xs text-text-secondary mb-2 uppercase tracking-wide font-semibold">
          Attachments
        </label>

        <AttachmentList
          attachments={attachments}
          onDelete={canEdit ? onDeleteAttachment : undefined}
          onDownload={onDownloadAttachment}
          onPreview={onPreviewImage}
          getPreviewUrl={getAttachmentPreviewUrl}
          canDelete={canEdit}
          loading={attachmentsLoading}
        />

        {canEdit && onUploadAttachment && (
          <div className="mt-3">
            <AttachmentUpload
              onUpload={onUploadAttachment}
              disabled={attachmentsLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
