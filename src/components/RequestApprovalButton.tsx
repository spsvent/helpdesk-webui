"use client";

import { useState } from "react";
import { Ticket } from "@/types/ticket";

interface RequestApprovalButtonProps {
  ticket: Ticket;
  onRequestApproval: () => Promise<void>;
  disabled?: boolean;
}

export default function RequestApprovalButton({
  ticket,
  onRequestApproval,
  disabled,
}: RequestApprovalButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onRequestApproval();
      setShowConfirm(false);
    } catch (error) {
      console.error("Failed to request approval:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  // Show re-request label if ticket was previously reviewed
  const isReRequest = ticket.approvalStatus !== "None";
  const buttonLabel = isReRequest ? "Re-request Approval" : "Request Approval";

  if (showConfirm) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <p className="text-xs text-blue-800 mb-2">
          {isReRequest
            ? "Request a new approval for this ticket?"
            : "Notify General Managers to review this ticket?"}
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-3 py-1.5 bg-brand-blue text-white text-xs rounded font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending..." : "Confirm"}
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="w-full px-3 py-1.5 bg-brand-blue text-white text-xs rounded font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {buttonLabel}
    </button>
  );
}
