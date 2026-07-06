"use client";

import { useState, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import { getGraphClient, searchUsers, updateTicketParticipants, OrgUser } from "@/lib/graphClient";
import UserAvatar from "./UserAvatar";

interface ParticipantsPanelProps {
  ticket: Ticket;
  comments: Comment[];
  onUpdate: (ticket: Ticket) => void;
}

interface AutoRow {
  email: string;
  name: string;
  note?: string;
}

/**
 * Participants section, rendered inline inside the ticket Details panel (between
 * Requester and Category). Shows the auto-discovered notification audience
 * (requester, assignee, approver, public commenters) as read-only rows, plus the
 * manually-added participants (the `participantEmails` field) which can be removed.
 * "+ Add" opens an inline people-picker; Enter commits the top match, Escape cancels.
 */
export default function ParticipantsPanel({ ticket, comments, onUpdate }: ParticipantsPanelProps) {
  const { instance, accounts } = useMsal();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-discovered participants (read-only). First occurrence wins.
  const autoRows = useMemo<AutoRow[]>(() => {
    const seen = new Set<string>();
    const rows: AutoRow[] = [];
    const add = (email?: string, name?: string, note?: string) => {
      if (!email) return;
      const key = email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ email: key, name: name || email, note });
    };
    add(ticket.requester.email, ticket.requester.displayName, "requester");
    add(ticket.originalAssignedTo || ticket.assignedTo?.email, ticket.assignedTo?.displayName || "Assignee", "assignee");
    add(ticket.approvedBy?.email, ticket.approvedBy?.displayName, "approver");
    comments.filter((c) => !c.isInternal).forEach((c) => add(c.createdBy.email, c.createdBy.displayName));
    return rows;
  }, [ticket, comments]);

  const autoKeys = useMemo(() => new Set(autoRows.map((r) => r.email)), [autoRows]);

  // Manually-added participants, deduped against the auto-discovered set for display.
  const allManual = ticket.participantEmails || [];
  const manualEmails = allManual.filter((e) => !autoKeys.has(e.toLowerCase()));

  const reset = () => {
    setAdding(false);
    setQuery("");
    setResults([]);
  };

  const runSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2 || !accounts[0]) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      setResults(await searchUsers(client, q.trim(), 8));
    } finally {
      setSearching(false);
    }
  };

  const commitEmail = async (email: string) => {
    const clean = email.trim();
    if (!clean || !accounts[0]) return;
    const lc = clean.toLowerCase();
    // Ignore duplicates (already a manual participant or an auto recipient).
    if (allManual.some((e) => e.toLowerCase() === lc) || autoKeys.has(lc)) {
      reset();
      return;
    }
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const updated = await updateTicketParticipants(client, ticket.id, [...allManual, clean]);
      onUpdate(updated);
      reset();
    } catch (e) {
      console.error("Failed to add participant:", e);
    } finally {
      setSaving(false);
    }
  };

  // "Add" / Enter: prefer a resolved people-picker match; fall back to a typed email.
  const commitInput = () => {
    if (results[0]?.email) return commitEmail(results[0].email);
    if (query.includes("@")) return commitEmail(query);
  };

  const removeParticipant = async (email: string) => {
    if (!accounts[0]) return;
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const next = allManual.filter((e) => e.toLowerCase() !== email.toLowerCase());
      const updated = await updateTicketParticipants(client, ticket.id, next);
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to remove participant:", e);
    } finally {
      setSaving(false);
    }
  };

  const isEmpty = autoRows.length === 0 && manualEmails.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-text-secondary">Participants</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-primary hover:text-brand-primary-light transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Add
          </button>
        )}
      </div>

      {isEmpty && !adding && (
        <p className="text-sm text-text-secondary italic">No participants</p>
      )}

      <div className="flex flex-col gap-1.5">
        {autoRows.map((r) => (
          <div key={`auto-${r.email}`} className="flex items-center gap-2">
            <UserAvatar name={r.name} size="sm" />
            <span className="text-[14.5px] flex-1 min-w-0 truncate">
              {r.name}
              {r.note && <span className="text-text-secondary"> ({r.note})</span>}
            </span>
          </div>
        ))}
        {manualEmails.map((email) => (
          <div key={`manual-${email}`} className="flex items-center gap-2">
            <UserAvatar name={email} size="sm" />
            <span className="text-[14.5px] flex-1 min-w-0 truncate">{email}</span>
            <button
              type="button"
              onClick={() => removeParticipant(email)}
              disabled={saving}
              title="Remove"
              aria-label={`Remove ${email}`}
              className="text-text-secondary hover:text-text-primary text-base leading-none px-1 disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-2 relative">
          <div className="flex gap-1.5">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitInput();
                } else if (e.key === "Escape") {
                  reset();
                }
              }}
              placeholder="Name or email"
              className="flex-1 min-w-0 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <button
              type="button"
              onClick={commitInput}
              disabled={saving}
              className="px-3 py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {(results.length > 0 || searching) && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-bg-card shadow-lg overflow-hidden">
              {searching && <p className="px-3 py-2 text-xs text-text-secondary">Searching…</p>}
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => commitEmail(u.email)}
                  disabled={saving}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-primary/[0.08] transition-colors"
                >
                  <span className="font-medium">{u.displayName}</span>
                  <span className="text-text-secondary"> · {u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
