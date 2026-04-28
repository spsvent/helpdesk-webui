"use client";

import { useState } from "react";
import { Ticket } from "@/types/ticket";
import LineItemsTable from "./LineItemsTable";
import { computeEstimatedTotal } from "@/lib/lineItemHelpers";

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
  const [error, setError] = useState<string | null>(null);

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

      {isPurchaseRequest && ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
        <div className="border border-border rounded-lg bg-bg-subtle p-3">
          <div className="text-xs font-semibold text-text-secondary mb-2">
            Reviewing {ticket.purchaseLineItems.length} item{ticket.purchaseLineItems.length === 1 ? "" : "s"}
          </div>
          <LineItemsTable items={ticket.purchaseLineItems} compact />
        </div>
      )}

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

          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}
        </div>
      ) : isPurchaseRequest ? (
        /* Purchase request: primary CTA + secondary chips */
        <div className="space-y-2">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0
              ? `Approve All ($${computeEstimatedTotal(ticket.purchaseLineItems).toFixed(0)})`
              : "Approve"}
          </button>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => handleActionSelect("Approved with Changes")}
              className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
            >
              w/ Changes
            </button>
            <button
              onClick={() => handleActionSelect("Approved & Ordered")}
              className="px-2 py-1.5 bg-white border border-blue-500 text-blue-600 text-xs rounded font-medium hover:bg-blue-50 transition-colors"
            >
              + Order
            </button>
            <button
              onClick={() => handleActionSelect("Denied")}
              className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ) : (
        /* Standard request: primary CTA + secondary chips */
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
