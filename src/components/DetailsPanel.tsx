"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket } from "@/types/ticket";
import { getGraphClient, updateTicket } from "@/lib/graphClient";
import UserAvatar from "./UserAvatar";

interface DetailsPanelProps {
  ticket: Ticket;
  onUpdate: (ticket: Ticket) => void;
  canEdit?: boolean;
}

const STATUS_OPTIONS: Ticket["status"][] = [
  "New",
  "In Progress",
  "On Hold",
  "Resolved",
  "Closed",
];

const PRIORITY_OPTIONS: Ticket["priority"][] = ["Low", "Normal", "High", "Urgent"];

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DetailsPanel({ ticket, onUpdate, canEdit = true }: DetailsPanelProps) {
  const { instance, accounts } = useMsal();
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleStatusChange = (newStatus: Ticket["status"]) => {
    setStatus(newStatus);
    setHasChanges(newStatus !== ticket.status || priority !== ticket.priority);
  };

  const handlePriorityChange = (newPriority: Ticket["priority"]) => {
    setPriority(newPriority);
    setHasChanges(status !== ticket.status || newPriority !== ticket.priority);
  };

  const handleSave = async () => {
    if (!accounts[0] || !hasChanges) return;

    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const updated = await updateTicket(client, ticket.id, {
        Status: status,
        Priority: priority,
      });
      onUpdate(updated);
      setHasChanges(false);
    } catch (e) {
      console.error("Failed to update ticket:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="font-semibold text-text-primary text-sm uppercase tracking-wide">
        Details
      </h2>

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

      {/* Assignee */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">
          Assignee
        </label>
        {ticket.assignedTo ? (
          <div className="flex items-center gap-2">
            <UserAvatar name={ticket.originalAssignedTo?.split('<')[0].trim() || ticket.assignedTo.displayName} size="sm" />
            <span className="text-sm">{ticket.originalAssignedTo || ticket.assignedTo.displayName}</span>
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

      {/* Category */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Category
        </label>
        <span className="text-sm">{ticket.category}</span>
      </div>

      {/* Problem Type */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Department
        </label>
        <span className="text-sm">{ticket.problemType}</span>
      </div>

      {/* Sub-Category */}
      {ticket.problemTypeSub && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Sub-Category
          </label>
          <span className="text-sm">{ticket.problemTypeSub}</span>
        </div>
      )}

      {/* Specific Type */}
      {ticket.problemTypeSub2 && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Specific Type
          </label>
          <span className="text-sm">{ticket.problemTypeSub2}</span>
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
        <span className="text-sm">{formatDate(ticket.created)}</span>
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Last Updated
        </label>
        <span className="text-sm">{formatDate(ticket.modified)}</span>
      </div>

      {ticket.dueDate && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Due Date
          </label>
          <span className="text-sm">{formatDate(ticket.dueDate)}</span>
        </div>
      )}
    </div>
  );
}
