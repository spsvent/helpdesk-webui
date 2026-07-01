"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { DecisionConflictError, decisionConflictMessage } from "@/shared/decisionConflict";
import { PurchaseRequest } from "../types";
import { PurchaseDecision, recordDecision } from "../purchaseService";
import { notifyPurchaseDecision } from "../purchaseEmail";

interface Props {
  pr: PurchaseRequest;
  onDecided: (updated: PurchaseRequest) => void;
  // The request was decided elsewhere (email link / another GM) while this panel
  // was open — the parent shows the message and reloads the fresh item.
  onConflict: (message: string) => void;
}

const BUTTONS: { decision: PurchaseDecision; label: string; className: string; needsNote?: boolean }[] = [
  { decision: "Approved", label: "Approve", className: "bg-green-600 hover:bg-green-700" },
  { decision: "Approved & Ordered", label: "Approve & Order", className: "bg-blue-600 hover:bg-blue-700" },
  { decision: "Changes Requested", label: "Request Changes", className: "bg-orange-500 hover:bg-orange-600", needsNote: true },
  { decision: "Denied", label: "Deny", className: "bg-red-600 hover:bg-red-700" },
];

export default function PurchaseApprovalPanel({ pr, onDecided, onConflict }: Props) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<PurchaseDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: PurchaseDecision, needsNote?: boolean) {
    if (!account) return;
    if (needsNote && !notes.trim()) {
      setError("Please describe the changes needed.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const client = getGraphClient(instance, account);
      const approverName = account.name || account.username || "";
      const updated = await recordDecision(client, pr.id, decision, approverName, account.username || "", notes.trim() || undefined);
      await notifyPurchaseDecision(client, updated, decision, approverName, notes.trim() || undefined);
      onDecided(updated);
    } catch (e) {
      console.error("[PurchaseApprovalPanel] failed:", e);
      if (e instanceof DecisionConflictError) {
        // Someone else already decided (or pulled back) this request — don't show
        // the generic "try again"; report the conflict and let the parent refresh.
        onConflict(decisionConflictMessage(e, "request"));
        return;
      }
      setError("Could not record the decision. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
      <h3 className="text-sm font-semibold text-yellow-900">Approval needed</h3>
      <p className="mt-1 text-xs text-yellow-800">
        Approving lets the purchasing team order it. “Approve &amp; Order” marks it ordered directly.
      </p>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional note (required when requesting changes)"
        className="mt-3 w-full rounded-lg border border-yellow-300 bg-white p-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.decision}
            type="button"
            onClick={() => decide(b.decision, b.needsNote)}
            disabled={busy !== null}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${b.className}`}
          >
            {busy === b.decision ? "…" : b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
