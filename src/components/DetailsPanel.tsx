"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Attachment } from "@/types/ticket";
import {
  getGraphClient,
  updateTicketFields,
  getUserByEmail,
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
import UserAvatar from "./UserAvatar";
import UserSearchDropdown from "./UserSearchDropdown";
import RequestApprovalButton from "./RequestApprovalButton";
import ApprovalActionPanel from "./ApprovalActionPanel";
import ApprovalHistory from "./ApprovalHistory";
import AttachmentList from "./AttachmentList";
import AttachmentUpload from "./AttachmentUpload";
import { formatDateTime } from "@/lib/dateUtils";
import { sendAssignmentEmail, sendStatusChangeEmail } from "@/lib/emailService";
import {
  sendStatusChangeTeamsNotification,
  sendPriorityEscalationTeamsNotification,
} from "@/lib/teamsService";

interface DetailsPanelProps {
  ticket: Ticket;
  onUpdate: (ticket: Ticket) => void;
  canEdit?: boolean;
  onRequestApproval?: () => Promise<void>;
  onApprovalDecision?: (decision: "Approved" | "Denied" | "Changes Requested", notes?: string) => Promise<void>;
  // Attachments
  attachments: Attachment[];
  attachmentsLoading?: boolean;
  onUploadAttachment?: (file: File) => Promise<boolean>;
  onDeleteAttachment?: (filename: string) => Promise<void>;
  onDownloadAttachment?: (filename: string) => Promise<void>;
}

const STATUS_OPTIONS: Ticket["status"][] = [
  "New",
  "In Progress",
  "On Hold",
  "Resolved",
  "Closed",
];

const PRIORITY_OPTIONS: Ticket["priority"][] = ["Low", "Normal", "High", "Urgent"];
const CATEGORY_OPTIONS: Ticket["category"][] = ["Request", "Problem"];

export default function DetailsPanel({
  ticket,
  onUpdate,
  canEdit = true,
  onRequestApproval,
  onApprovalDecision,
  attachments,
  attachmentsLoading = false,
  onUploadAttachment,
  onDeleteAttachment,
  onDownloadAttachment,
}: DetailsPanelProps) {
  const { instance, accounts } = useMsal();
  const { canRequestApproval, canApprove, permissions } = useRBAC();
  const isAdmin = permissions?.role === "admin";

  // Basic fields (support staff can edit)
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);

  // Admin-only editable fields
  const [category, setCategory] = useState(ticket.category);
  const [problemType, setProblemType] = useState(ticket.problemType);
  const [problemTypeSub, setProblemTypeSub] = useState(ticket.problemTypeSub || "");
  const [problemTypeSub2, setProblemTypeSub2] = useState(ticket.problemTypeSub2 || "");
  const [selectedAssignee, setSelectedAssignee] = useState<{ displayName: string; email: string } | null>(
    ticket.assignedTo ? {
      displayName: ticket.originalAssignedTo?.split('<')[0].trim() || ticket.assignedTo.displayName,
      email: ticket.assignedTo.email || "",
    } : null
  );

  // Cascading dropdown options
  const [problemTypeSubs, setProblemTypeSubs] = useState<string[]>([]);
  const [problemTypeSub2s, setProblemTypeSub2s] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [autoAssignSuggestion, setAutoAssignSuggestion] = useState<string | null>(null);

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
  useEffect(() => {
    const basicChanges =
      status !== ticket.status ||
      priority !== ticket.priority;

    const adminChanges = isAdmin && (
      category !== ticket.category ||
      problemType !== ticket.problemType ||
      problemTypeSub !== (ticket.problemTypeSub || "") ||
      problemTypeSub2 !== (ticket.problemTypeSub2 || "") ||
      (selectedAssignee?.displayName !== (ticket.originalAssignedTo?.split('<')[0].trim() || ticket.assignedTo?.displayName))
    );

    setHasChanges(basicChanges || !!adminChanges);
  }, [status, priority, category, problemType, problemTypeSub, problemTypeSub2, selectedAssignee, ticket, isAdmin]);

  // Auto-assign when department changes
  useEffect(() => {
    if (isAdmin && problemType !== ticket.problemType) {
      const suggestion = getSuggestedAssignee(
        problemType,
        problemTypeSub || undefined,
        problemTypeSub2 || undefined,
        category
      );
      if (suggestion) {
        // Automatically apply the assignment
        setAutoAssignSuggestion(suggestion);
        // Look up the user and set them as assignee
        const applyAutoAssignment = async () => {
          if (!accounts[0]) return;
          try {
            const client = getGraphClient(instance, accounts[0]);
            const user = await getUserByEmail(client, suggestion);
            if (user) {
              setSelectedAssignee({ displayName: user.displayName, email: user.email });
            }
          } catch (error) {
            console.error("Failed to lookup suggested assignee:", error);
          }
        };
        applyAutoAssignment();
      }
    } else {
      setAutoAssignSuggestion(null);
    }
  }, [problemType, problemTypeSub, problemTypeSub2, category, ticket.problemType, isAdmin, accounts, instance]);

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
    const oldAssigneeEmail = ticket.assignedTo?.email;

    try {
      const client = getGraphClient(instance, accounts[0]);

      // Build updates object
      const updates: Parameters<typeof updateTicketFields>[2] = {
        Status: status,
        Priority: priority,
      };

      // Add admin-only fields if user is admin
      if (isAdmin) {
        updates.Category = category;
        updates.ProblemType = problemType;
        updates.ProblemTypeSub = problemTypeSub || undefined;
        updates.ProblemTypeSub2 = problemTypeSub2 || undefined;

        // Handle assignee change
        if (selectedAssignee?.email && selectedAssignee.email !== ticket.assignedTo?.email) {
          // Look up the user to get their SharePoint ID
          const user = await getUserByEmail(client, selectedAssignee.email);
          if (user) {
            // For SharePoint, we need to use the user's ID from the site's user info list
            // This is a simplified approach - may need adjustment based on SharePoint setup
            // Using email-based assignment for now
          }
        }
      }

      const updated = await updateTicketFields(client, ticket.id, updates);
      onUpdate(updated);
      setHasChanges(false);
      setAutoAssignSuggestion(null);

      // Send email notifications (don't block on these)
      // Notify new assignee if assignment changed
      if (selectedAssignee?.email && selectedAssignee.email !== oldAssigneeEmail) {
        sendAssignmentEmail(
          client,
          updated,
          selectedAssignee.email,
          selectedAssignee.displayName,
          currentUserName
        ).catch((e) => console.error("Failed to send assignment email:", e));
      }

      // Notify requester if status changed
      if (status !== oldStatus && ticket.requester.email) {
        sendStatusChangeEmail(
          client,
          updated,
          ticket.requester.email,
          oldStatus,
          currentUserName
        ).catch((e) => console.error("Failed to send status change email:", e));

        // Also send Teams notification for status change
        sendStatusChangeTeamsNotification(client, updated, oldStatus, currentUserName);
      }

      // Send Teams notification for priority escalation
      if (priority !== oldPriority) {
        sendPriorityEscalationTeamsNotification(client, updated, oldPriority, currentUserName);
      }
    } catch (e) {
      console.error("Failed to update ticket:", e);
    } finally {
      setSaving(false);
    }
  };

  const showProblemTypeSub = hasSubCategories(problemType);
  const showProblemTypeSub2 = showProblemTypeSub && hasSub2Categories(problemType, problemTypeSub);

  return (
    <div className="p-4 space-y-6">
      <h2 className="font-semibold text-text-primary text-sm uppercase tracking-wide">
        Details
      </h2>

      {/* Approval Section */}
      {(canRequestApproval(ticket) || canApprove() || ticket.approvalStatus !== "None") && (
        <>
          {/* Approval Actions for Admins */}
          {canApprove() && onApprovalDecision && (
            <ApprovalActionPanel ticket={ticket} onDecision={onApprovalDecision} />
          )}

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

      <hr className="border-border" />

      {/* Category - Editable by admins */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Category
          {isAdmin && <span className="ml-1 text-brand-blue">(editable)</span>}
        </label>
        {isAdmin && canEdit ? (
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as Ticket["category"])}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
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

      {/* Save button */}
      {hasChanges && canEdit && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-brand-blue text-white rounded-lg font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
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

      <hr className="border-border" />

      {/* Attachments */}
      <div>
        <label className="block text-xs text-text-secondary mb-2 uppercase tracking-wide font-semibold">
          Attachments
        </label>

        <AttachmentList
          attachments={attachments}
          onDelete={canEdit ? onDeleteAttachment : undefined}
          onDownload={onDownloadAttachment}
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
