"use client";

import { useState, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import { getGraphClient, searchUsers, updateTicketParticipants, OrgUser } from "@/lib/graphClient";

interface ParticipantsPanelProps {
  ticket: Ticket;
  comments: Comment[];
  onUpdate: (ticket: Ticket) => void;
}

export default function ParticipantsPanel({ ticket, comments, onUpdate }: ParticipantsPanelProps) {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-discovered participants (read-only chips)
  const autoEmails = useMemo(() => {
    const set = new Map<string, string>(); // lowercased -> display
    const add = (email?: string, name?: string) => {
      if (!email) return;
      const key = email.toLowerCase();
      if (!set.has(key)) set.set(key, name || email);
    };
    add(ticket.requester.email, `${ticket.requester.displayName} (requester)`);
    add(ticket.originalAssignedTo || ticket.assignedTo?.email, ticket.assignedTo?.displayName || "Assignee");
    add(ticket.approvedBy?.email, ticket.approvedBy?.displayName ? `${ticket.approvedBy.displayName} (approver)` : undefined);
    comments.filter((c) => !c.isInternal).forEach((c) => add(c.createdBy.email, c.createdBy.displayName));
    return set;
  }, [ticket, comments]);

  const manualEmails = ticket.participantEmails || [];

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

  const addParticipant = async (user: OrgUser) => {
    if (!accounts[0] || !user.email) return;
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const updated = await updateTicketParticipants(client, ticket.id, [...manualEmails, user.email]);
      onUpdate(updated);
      setQuery("");
      setResults([]);
    } catch (e) {
      console.error("Failed to add participant:", e);
    } finally {
      setSaving(false);
    }
  };

  const removeParticipant = async (email: string) => {
    if (!accounts[0]) return;
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const next = manualEmails.filter((e) => e.toLowerCase() !== email.toLowerCase());
      const updated = await updateTicketParticipants(client, ticket.id, next);
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to remove participant:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-2">Participants</h3>
      <p className="text-xs text-text-secondary mb-3">Everyone here is notified of new comments and updates.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {Array.from(autoEmails.entries()).map(([email, label]) => (
          <span key={`auto-${email}`} className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {label}
          </span>
        ))}
        {manualEmails.map((email) => (
          <span key={`manual-${email}`} className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-3 py-1 text-xs text-brand-primary">
            {email}
            <button onClick={() => removeParticipant(email)} disabled={saving} className="ml-1 text-brand-primary/70 hover:text-brand-primary" aria-label={`Remove ${email}`}>×</button>
          </span>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Add a person…"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        {(results.length > 0 || searching) && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-bg-elevated shadow-lg">
            {searching && <p className="px-3 py-2 text-xs text-text-secondary">Searching…</p>}
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => addParticipant(u)}
                disabled={saving}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{u.displayName}</span>
                <span className="text-text-secondary"> · {u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
