"use client";

import { useEffect, useState } from "react";
import { Ticket } from "@/types/ticket";
import { loadDraft, clearDraft } from "@/lib/formDraft";

type ApprovalDecision = "Approved" | "Denied" | "Changes Requested";

interface ApprovalActionPanelProps {
  ticket: Ticket;
  onDecision: (decision: ApprovalDecision, notes?: string) => Promise<void>;
}

// Ticket approval: Approve / Request Changes / Deny. (Purchase requests run their
// own approval UI in the purchase module — src/modules/purchase/.)
export default function ApprovalActionPanel({ ticket, onDecision }: ApprovalActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<ApprovalDecision | null>(null);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a decision draft snapshotted before a renewal redirect, then clear it (one-shot).
  useEffect(() => {
    const d = loadDraft<{ notes?: string }>(`approval:${ticket.id}`);
    if (d) {
      if (typeof d.notes === "string") setNotes(d.notes);
      clearDraft(`approval:${ticket.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPending = ticket.approvalStatus === "Pending";
  const notesRequired = selectedAction === "Denied" || selectedAction === "Changes Requested";

  const handleActionSelect = (action: ApprovalDecision) => {
    setSelectedAction(action);
    setNotes("");
    setError(null);
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;
    if (notesRequired && !notes.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await onDecision(selectedAction, notes.trim() || undefined);
      setSelectedAction(null);
      setNotes("");
    } catch (err) {
      console.error("Failed to process approval:", err);
      setError("Failed to save approval decision. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedAction(null);
    setNotes("");
    setError(null);
  };

  const getActionColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-100 text-green-800";
      case "Denied": return "bg-red-100 text-red-800";
      case "Changes Requested": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getConfirmColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-600 hover:bg-green-700";
      case "Denied": return "bg-red-600 hover:bg-red-700";
      case "Changes Requested": return "bg-orange-600 hover:bg-orange-700";
      default: return "bg-gray-600 hover:bg-gray-700";
    }
  };

  const getPlaceholder = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "Add any notes for the approval...";
      case "Denied": return "Please explain why this request is denied...";
      case "Changes Requested": return "Describe what changes are needed...";
      default: return "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          {isPending ? "Approval Decision" : "Approval Actions"}
        </h4>
        {isPending && (
          <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
            Awaiting Decision
          </span>
        )}
      </div>

      {selectedAction ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-sm font-medium ${getActionColor(selectedAction)}`}>
              {selectedAction}
            </span>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Notes {notesRequired ? "(required)" : "(optional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={getPlaceholder(selectedAction)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={isLoading || (notesRequired && !notes.trim())}
              className={`flex-1 px-4 py-2 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getConfirmColor(selectedAction)}`}
            >
              {isLoading ? "Processing..." : `Confirm ${selectedAction}`}
            </button>
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleActionSelect("Changes Requested")}
              className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
            >
              Changes
            </button>
            <button
              onClick={() => handleActionSelect("Denied")}
              className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
