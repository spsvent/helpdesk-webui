"use client";

import { useState } from "react";
import { Ticket } from "@/types/ticket";

type ApprovalDecision = "Approved" | "Denied" | "Changes Requested";

interface ApprovalActionPanelProps {
  ticket: Ticket;
  onDecision: (decision: ApprovalDecision, notes?: string) => Promise<void>;
}

export default function ApprovalActionPanel({ ticket, onDecision }: ApprovalActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<ApprovalDecision | null>(null);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isPending = ticket.approvalStatus === "Pending";

  const handleActionSelect = (action: ApprovalDecision) => {
    setSelectedAction(action);
    setNotes("");
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;

    // Notes are required for Deny and Changes Requested
    if ((selectedAction === "Denied" || selectedAction === "Changes Requested") && !notes.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await onDecision(selectedAction, notes.trim() || undefined);
      setSelectedAction(null);
      setNotes("");
    } catch (error) {
      console.error("Failed to process approval:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedAction(null);
    setNotes("");
  };

  const notesRequired = selectedAction === "Denied" || selectedAction === "Changes Requested";

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
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${
                selectedAction === "Approved"
                  ? "bg-green-100 text-green-800"
                  : selectedAction === "Denied"
                  ? "bg-red-100 text-red-800"
                  : "bg-orange-100 text-orange-800"
              }`}
            >
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
              placeholder={
                selectedAction === "Approved"
                  ? "Add any notes for the approval..."
                  : selectedAction === "Denied"
                  ? "Please explain why this request is denied..."
                  : "Describe what changes are needed..."
              }
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={isLoading || (notesRequired && !notes.trim())}
              className={`flex-1 px-4 py-2 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedAction === "Approved"
                  ? "bg-green-600 hover:bg-green-700"
                  : selectedAction === "Denied"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
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
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="flex-1 px-2 py-1.5 bg-green-600 text-white text-xs rounded font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>
          <button
            onClick={() => handleActionSelect("Denied")}
            className="flex-1 px-2 py-1.5 bg-red-600 text-white text-xs rounded font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Deny
          </button>
          <button
            onClick={() => handleActionSelect("Changes Requested")}
            className="flex-1 px-2 py-1.5 bg-orange-600 text-white text-xs rounded font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            Changes
          </button>
        </div>
      )}
    </div>
  );
}
