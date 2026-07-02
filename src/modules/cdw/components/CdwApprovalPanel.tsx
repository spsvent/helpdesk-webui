"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { DecisionConflictError, decisionConflictMessage } from "@/shared/decisionConflict";
import { CDWBrief, CdwDecision } from "../types";
import { recordDecision } from "../cdwService";
import { notifyCdwDecision } from "../cdwEmail";

interface Props {
  brief: CDWBrief;
  onDecided: (updated: CDWBrief) => void;
  // The brief was decided elsewhere (email link / another GM) while this panel
  // was open — the parent shows the message and reloads the fresh item.
  onConflict: (message: string) => void;
}

export default function CdwApprovalPanel({ brief, onDecided, onConflict }: Props) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<CdwDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: CdwDecision) {
    if (!account) return;
    if (decision === "Changes Requested" && !notes.trim()) {
      setError("Please describe the changes needed.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const client = getGraphClient(instance, account);
      const approverName = account.name || account.username || "";
      const updated = await recordDecision(
        client,
        brief.id,
        decision,
        approverName,
        account.username || "",
        notes.trim() || undefined
      );
      await notifyCdwDecision(client, updated, decision, approverName, notes.trim() || undefined).catch(
        (e) => console.error("[CdwApprovalPanel] notify failed:", e)
      );
      onDecided(updated);
    } catch (e) {
      console.error("[CdwApprovalPanel] decision failed:", e);
      if (e instanceof DecisionConflictError) {
        // Someone else already decided (or pulled back) this brief — don't show
        // the generic "try again"; report the conflict and let the parent refresh.
        onConflict(decisionConflictMessage(e, "brief"));
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
        Approving makes this brief public and notifies the named final recipient.
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
        <button
          type="button"
          onClick={() => decide("Approved")}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {busy === "Approved" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => decide("Changes Requested")}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
        >
          {busy === "Changes Requested" ? "Saving…" : "Request Changes"}
        </button>
        <button
          type="button"
          onClick={() => decide("Denied")}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy === "Denied" ? "Denying…" : "Deny"}
        </button>
      </div>
    </div>
  );
}
