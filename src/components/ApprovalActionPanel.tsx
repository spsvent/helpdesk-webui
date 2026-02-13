"use client";

import { useState } from "react";
import { Ticket } from "@/types/ticket";

type ApprovalDecision = "Approved" | "Denied" | "Changes Requested" | "Approved with Changes" | "Approved & Ordered";

interface ApprovalActionPanelProps {
  ticket: Ticket;
  isPurchaseRequest?: boolean;
  onDecision: (decision: ApprovalDecision, notes?: string) => Promise<void>;
}

export default function ApprovalActionPanel({ ticket, isPurchaseRequest = false, onDecision }: ApprovalActionPanelProps) {
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

    // Notes are required for Deny, Changes Requested, and Approved with Changes
    const requiresNotes =
      selectedAction === "Denied" ||
      selectedAction === "Changes Requested" ||
      selectedAction === "Approved with Changes";

    if (requiresNotes && !notes.trim()) {
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

  const notesRequired =
    selectedAction === "Denied" ||
    selectedAction === "Changes Requested" ||
    selectedAction === "Approved with Changes";

  const getActionColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-100 text-green-800";
      case "Approved with Changes": return "bg-orange-100 text-orange-800";
      case "Approved & Ordered": return "bg-blue-100 text-blue-800";
      case "Denied": return "bg-red-100 text-red-800";
      case "Changes Requested": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getConfirmColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-600 hover:bg-green-700";
      case "Approved with Changes": return "bg-orange-600 hover:bg-orange-700";
      case "Approved & Ordered": return "bg-blue-600 hover:bg-blue-700";
      case "Denied": return "bg-red-600 hover:bg-red-700";
      case "Changes Requested": return "bg-orange-600 hover:bg-orange-700";
      default: return "bg-gray-600 hover:bg-gray-700";
    }
  };

  const getPlaceholder = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "Add any notes for the approval...";
      case "Approved with Changes": return "Describe the approved changes...";
      case "Approved & Ordered": return "Add order details if applicable...";
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
        </div>
      ) : isPurchaseRequest ? (
        /* Purchase request: 4-button layout */
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="px-2 py-1.5 bg-green-600 text-white text-xs rounded font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>
          <button
            onClick={() => handleActionSelect("Approved with Changes")}
            className="px-2 py-1.5 bg-orange-600 text-white text-xs rounded font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            w/ Changes
          </button>
          <button
            onClick={() => handleActionSelect("Approved & Ordered")}
            className="px-2 py-1.5 bg-blue-600 text-white text-xs rounded font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            Approve & Order
          </button>
          <button
            onClick={() => handleActionSelect("Denied")}
            className="px-2 py-1.5 bg-red-600 text-white text-xs rounded font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Deny
          </button>
        </div>
      ) : (
        /* Standard request: 3-button layout */
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
