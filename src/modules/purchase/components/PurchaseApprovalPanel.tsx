"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { DecisionConflictError, decisionConflictMessage } from "@/shared/decisionConflict";
import { PurchaseLineItem, PurchaseRequest } from "../types";
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

function itemLabel(item: PurchaseLineItem, i: number): string {
  const name = item.name?.trim() || item.url?.trim() || `Item ${i + 1}`;
  return `${name} (qty ${item.qty})`;
}

// Auto-filled approval note summarizing which items the GM dropped.
function removedNote(items: PurchaseLineItem[], kept: boolean[]): string {
  const removed = items.map((it, i) => (kept[i] ? null : itemLabel(it, i))).filter(Boolean) as string[];
  if (removed.length === 0) return "";
  return `Approved without ${removed.length} item${removed.length > 1 ? "s" : ""}: ${removed.join(", ")}.`;
}

export default function PurchaseApprovalPanel({ pr, onDecided, onConflict }: Props) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<PurchaseDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Approve with Changes" checklist mode: which line items survive the GM's edits.
  const [changesMode, setChangesMode] = useState(false);
  const [kept, setKept] = useState<boolean[]>([]);
  // Once the GM types their own note, stop auto-overwriting it as the checklist changes.
  const [notesEdited, setNotesEdited] = useState(false);

  async function decide(
    decision: PurchaseDecision,
    opts?: { needsNote?: boolean; lineItems?: PurchaseLineItem[] }
  ) {
    if (!account) return;
    if (opts?.needsNote && !notes.trim()) {
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
        pr.id,
        decision,
        approverName,
        account.username || "",
        notes.trim() || undefined,
        opts?.lineItems
      );
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

  function enterChangesMode() {
    setChangesMode(true);
    setKept(pr.lineItems.map(() => true));
    setNotes("");
    setNotesEdited(false);
    setError(null);
  }

  function toggleItem(i: number) {
    const next = kept.map((k, idx) => (idx === i ? !k : k));
    setKept(next);
    if (!notesEdited) setNotes(removedNote(pr.lineItems, next));
  }

  function confirmChanges() {
    const keptItems = pr.lineItems.filter((_, i) => kept[i]);
    if (keptItems.length === 0) {
      setError("Keep at least one item — to reject everything, use Deny instead.");
      return;
    }
    decide("Approved with Changes", { lineItems: keptItems });
  }

  const keptCount = kept.filter(Boolean).length;

  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
      <h3 className="text-sm font-semibold text-yellow-900">Approval needed</h3>

      {changesMode ? (
        <>
          <p className="mt-1 text-xs text-yellow-800">
            Untick any items the requester should <em>not</em> order. Only the ticked items are approved.
          </p>
          <ul className="mt-3 space-y-1.5">
            {pr.lineItems.map((item, i) => (
              <li key={i}>
                <label className="flex items-start gap-2 text-sm text-yellow-900">
                  <input
                    type="checkbox"
                    checked={kept[i] ?? true}
                    onChange={() => toggleItem(i)}
                    className="mt-0.5"
                  />
                  <span className={kept[i] ? "" : "line-through opacity-60"}>{itemLabel(item, i)}</span>
                </label>
              </li>
            ))}
          </ul>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesEdited(true);
            }}
            placeholder="Note to the requester (auto-filled with removed items — edit as needed)"
            className="mt-3 w-full rounded-lg border border-yellow-300 bg-white p-2 text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmChanges}
              disabled={busy !== null || keptCount === 0}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {busy === "Approved with Changes"
                ? "…"
                : `Approve ${keptCount} of ${pr.lineItems.length} item${pr.lineItems.length > 1 ? "s" : ""}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setChangesMode(false);
                setNotes("");
                setNotesEdited(false);
                setError(null);
              }}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-yellow-300 bg-white text-yellow-900 hover:bg-yellow-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
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
                onClick={() => decide(b.decision, { needsNote: b.needsNote })}
                disabled={busy !== null}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${b.className}`}
              >
                {busy === b.decision ? "…" : b.label}
              </button>
            ))}
            {pr.lineItems.length > 0 && (
              <button
                type="button"
                onClick={enterChangesMode}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                Approve with Changes
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
