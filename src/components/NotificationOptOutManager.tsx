"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import {
  fetchNotificationOptOuts,
  createNotificationOptOut,
  updateNotificationOptOut,
  deleteNotificationOptOut,
  createNotificationOptOutList,
  NotificationOptOut,
} from "@/lib/notificationOptOutService";

export default function NotificationOptOutManager() {
  const { instance, accounts } = useMsal();
  const [entries, setEntries] = useState<NotificationOptOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // New entry inputs
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!accounts[0]) return;
    setLoading(true);
    setError(null);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const data = await fetchNotificationOptOuts(client);
      setEntries(data);
      setListConfigured(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e.message?.includes("not configured")) {
        setListConfigured(false);
      } else {
        setError("Failed to load opt-out list: " + (e.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_NOTIFICATION_OPTOUT_LIST_ID) {
      setListConfigured(false);
      setLoading(false);
      return;
    }
    loadEntries();
  }, [loadEntries]);

  const handleCreateList = async () => {
    if (!accounts[0]) return;
    setCreatingList(true);
    setError(null);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const listId = await createNotificationOptOutList(client);
      setNewListId(listId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError("Failed to create list: " + (e.message || "Unknown error"));
    } finally {
      setCreatingList(false);
    }
  };

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!accounts[0] || !email) return;
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (entries.some((e) => e.email.toLowerCase() === email)) {
      setError(`${email} is already on the opt-out list.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const entry = await createNotificationOptOut(client, {
        email,
        displayName: newName.trim(),
        reason: newReason.trim(),
      });
      setEntries((prev) =>
        [...prev, entry].sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
      setNewEmail("");
      setNewName("");
      setNewReason("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError("Failed to add opt-out: " + (e.message || "Unknown error"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (entry: NotificationOptOut) => {
    if (!accounts[0]) return;
    try {
      const client = getGraphClient(instance, accounts[0]);
      await updateNotificationOptOut(client, entry.id, { isActive: !entry.isActive });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, isActive: !e.isActive } : e))
      );
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError("Failed to update opt-out: " + (e.message || "Unknown error"));
    }
  };

  const handleDelete = async (entry: NotificationOptOut) => {
    if (!accounts[0] || !confirm(`Remove ${entry.email} from the opt-out list? They will start receiving notifications again.`)) return;
    try {
      const client = getGraphClient(instance, accounts[0]);
      await deleteNotificationOptOut(client, entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError("Failed to remove opt-out: " + (e.message || "Unknown error"));
    }
  };

  // Not configured state
  if (!listConfigured) {
    return (
      <div className="bg-bg-card rounded-xl p-8">
        <div className="text-center max-w-lg mx-auto">
          {newListId ? (
            <>
              <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Created!</h2>
              <p className="text-text-secondary mb-4">
                The NotificationOptOut list has been created. Add its ID to the deployment
                environment (GitHub Actions workflow for production, or <code className="bg-gray-200 px-1 rounded">.env.local</code> for dev):
              </p>
              <div className="text-left bg-bg-subtle rounded-lg p-4 text-sm mb-4">
                <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                  NEXT_PUBLIC_NOTIFICATION_OPTOUT_LIST_ID={newListId}
                </div>
                <p className="text-text-secondary mt-2">
                  Also set <code className="bg-gray-200 px-1 rounded">NOTIFICATION_OPTOUT_LIST_ID</code> to the same
                  value on the <code className="bg-gray-200 px-1 rounded">helpdesk-notify-func</code> Function App so
                  server-side suppression can read the list.
                </p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
              >
                Refresh Page
              </button>
            </>
          ) : (
            <>
              <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">Opt-Out List Not Configured</h2>
              <p className="text-text-secondary mb-4">
                The NotificationOptOut list needs to be created before you can silence notifications for specific people.
              </p>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              <button
                onClick={handleCreateList}
                disabled={creatingList}
                className="px-6 py-3 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 mb-6"
              >
                {creatingList ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating List...
                  </span>
                ) : (
                  "Create NotificationOptOut List"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Loading opt-out list...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-text-primary">Notification Opt-Out</h2>
        <p className="text-sm text-text-secondary">
          Addresses listed here receive <strong>no</strong> help desk notification email — approvals, purchase
          requests, escalations, comments, status changes, and assignments. Opting someone out does not change their
          app access or role (a GM stays a GM, a Purchaser stays a Purchaser); it only stops the email.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Add entry */}
      <div className="bg-bg-card rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Email to silence (e.g. bill@skyparksantasvillage.com)"
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Name (optional)"
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>
        <div className="flex gap-3 mt-3">
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Reason (optional)"
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newEmail.trim()}
            className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 whitespace-nowrap"
          >
            {adding ? "Adding..." : "Add Opt-Out"}
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-bg-card rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-text-secondary">No one is opted out.</p>
            <p className="text-sm text-text-secondary mt-2">
              Add an email above to stop sending help desk notifications to that person.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 hover:bg-bg-subtle transition-colors gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => handleToggle(entry)}
                    title={entry.isActive ? "Suppressing — click to pause" : "Paused — click to resume suppressing"}
                    className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                      entry.isActive ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        entry.isActive ? "translate-x-4" : ""
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${entry.isActive ? "text-text-primary" : "text-text-secondary line-through"}`}>
                      {entry.displayName || entry.email}
                    </div>
                    {entry.displayName && (
                      <div className="text-xs text-text-secondary truncate">{entry.email}</div>
                    )}
                    {entry.reason && (
                      <div className="text-xs text-text-secondary italic truncate">{entry.reason}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(entry)}
                  className="p-1.5 text-text-secondary hover:text-red-600 rounded transition-colors shrink-0"
                  title="Remove from opt-out list"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-medium mb-1">How it works</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>Suppression is enforced server-side, so every notification path is covered.</li>
          <li>The toggle pauses an entry without deleting it; delete removes it entirely.</li>
          <li>Access and RBAC roles are never affected — this only stops email delivery.</li>
          <li>Changes take effect within about a minute (the server caches the list briefly).</li>
        </ul>
      </div>
    </div>
  );
}
