"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, mergeTickets } from "@/lib/graphClient";
import { Ticket } from "@/types/ticket";
import TicketSearchPicker from "./TicketSearchPicker";

interface MergeTicketPanelProps {
  ticket: Ticket;
  onMergeComplete: () => void;
}

type MergeState = "idle" | "searching" | "confirming" | "merging" | "done";

export default function MergeTicketPanel({
  ticket,
  onMergeComplete,
}: MergeTicketPanelProps) {
  const { instance, accounts } = useMsal();
  const [state, setState] = useState<MergeState>("idle");
  const [targetTicket, setTargetTicket] = useState<Ticket | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const isClosed = ticket.status === "Closed";

  const handleSelectTarget = (selected: Ticket) => {
    setTargetTicket(selected);
    setState("confirming");
  };

  const handleConfirmMerge = async () => {
    if (!accounts[0] || !targetTicket) return;

    setState("merging");
    try {
      const client = getGraphClient(instance, accounts[0]);
      const mergeResult = await mergeTickets(
        client,
        ticket.id,
        (ticket.ticketNumber || ticket.id).toString(),
        targetTicket.id,
        (targetTicket.ticketNumber || targetTicket.id).toString(),
        {
          email: accounts[0].username,
          name: accounts[0].name || accounts[0].username,
        }
      );

      if (mergeResult.errors.length === 0) {
        setResult({
          success: true,
          message: `Merged ${mergeResult.copiedComments} comment${mergeResult.copiedComments !== 1 ? "s" : ""} into #${targetTicket.ticketNumber || targetTicket.id}`,
        });
      } else {
        setResult({
          success: false,
          message: mergeResult.errors.join(". "),
        });
      }
      setState("done");
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Merge failed",
      });
      setState("done");
    }
  };

  const handleReset = () => {
    setState("idle");
    setTargetTicket(null);
    setResult(null);
    if (result?.success) {
      onMergeComplete();
    }
  };

  // idle state - show merge button
  if (state === "idle") {
    return (
      <div>
        <button
          onClick={() => setState("searching")}
          disabled={isClosed}
          className="w-full px-3 py-2 text-sm font-medium border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          title={isClosed ? "Cannot merge a closed ticket" : "Merge this ticket into another"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Merge Ticket
        </button>
      </div>
    );
  }

  // searching state - show ticket search picker
  if (state === "searching") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-text-secondary font-medium">
          Merge into ticket:
        </label>
        <TicketSearchPicker
          excludeIds={[ticket.id]}
          onSelect={handleSelectTarget}
          onCancel={() => setState("idle")}
        />
      </div>
    );
  }

  // confirming state - show confirmation
  if (state === "confirming" && targetTicket) {
    return (
      <div className="space-y-3 p-3 border border-yellow-300 bg-yellow-50 rounded-lg">
        <div className="text-sm font-medium text-yellow-800">
          Confirm Merge
        </div>
        <div className="text-sm text-yellow-700">
          This ticket (#{ticket.ticketNumber || ticket.id}) will be{" "}
          <strong>closed</strong>. All comments will be copied to:
        </div>
        <div className="p-2 bg-white rounded border border-yellow-200">
          <div className="text-sm font-medium text-brand-primary">
            #{targetTicket.ticketNumber || targetTicket.id}
          </div>
          <div className="text-sm text-text-primary truncate">
            {targetTicket.title}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConfirmMerge}
            className="flex-1 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg font-medium hover:bg-teal-700 transition-colors"
          >
            Confirm Merge
          </button>
          <button
            onClick={() => {
              setTargetTicket(null);
              setState("searching");
            }}
            className="px-3 py-1.5 border border-border text-text-secondary text-sm rounded-lg hover:bg-bg-subtle transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // merging state - show spinner
  if (state === "merging") {
    return (
      <div className="flex items-center gap-2 p-3 border border-border rounded-lg">
        <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-text-secondary">Merging...</span>
      </div>
    );
  }

  // done state - show result
  if (state === "done" && result) {
    return (
      <div className={`space-y-2 p-3 rounded-lg border ${
        result.success
          ? "border-green-300 bg-green-50"
          : "border-red-300 bg-red-50"
      }`}>
        <div className={`text-sm ${result.success ? "text-green-700" : "text-red-700"}`}>
          {result.success ? "Merge complete" : "Merge failed"}
        </div>
        <div className={`text-sm ${result.success ? "text-green-600" : "text-red-600"}`}>
          {result.message}
        </div>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-bg-subtle transition-colors"
        >
          OK
        </button>
      </div>
    );
  }

  return null;
}
