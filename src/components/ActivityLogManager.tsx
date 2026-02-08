"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getGraphClient,
  getActivityLog,
  createActivityLogList,
  ActivityLogEntry,
  ActivityEventType,
} from "@/lib/graphClient";

const EVENT_TYPE_LABELS: Record<ActivityEventType, { label: string; color: string }> = {
  ticket_created: { label: "Ticket Created", color: "bg-green-100 text-green-800" },
  ticket_updated: { label: "Ticket Updated", color: "bg-blue-100 text-blue-800" },
  ticket_status_changed: { label: "Status Changed", color: "bg-purple-100 text-purple-800" },
  ticket_priority_changed: { label: "Priority Changed", color: "bg-orange-100 text-orange-800" },
  ticket_assigned: { label: "Assigned", color: "bg-cyan-100 text-cyan-800" },
  ticket_escalated: { label: "Escalated", color: "bg-red-100 text-red-800" },
  comment_added: { label: "Comment Added", color: "bg-gray-100 text-gray-800" },
  email_sent: { label: "Email Sent", color: "bg-indigo-100 text-indigo-800" },
  approval_requested: { label: "Approval Requested", color: "bg-yellow-100 text-yellow-800" },
  approval_approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800" },
  approval_rejected: { label: "Rejected", color: "bg-rose-100 text-rose-800" },
  escalation_triggered: { label: "Escalation Triggered", color: "bg-amber-100 text-amber-800" },
  ticket_merged: { label: "Ticket Merged", color: "bg-teal-100 text-teal-800" },
};

const EVENT_TYPE_OPTIONS: ActivityEventType[] = [
  "ticket_created",
  "ticket_updated",
  "ticket_status_changed",
  "ticket_priority_changed",
  "ticket_assigned",
  "ticket_escalated",
  "comment_added",
  "email_sent",
  "approval_requested",
  "approval_approved",
  "approval_rejected",
  "escalation_triggered",
  "ticket_merged",
];

export default function ActivityLogManager() {
  const { instance, accounts } = useMsal();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // Filters
  const [filterEventType, setFilterEventType] = useState<string>("");
  const [filterTicket, setFilterTicket] = useState<string>("");
  const [filterLimit, setFilterLimit] = useState<number>(100);

  // Load entries
  const loadEntries = useCallback(async () => {
    if (!accounts[0]) return;

    setLoading(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const data = await getActivityLog(client, {
        eventType: filterEventType as ActivityEventType || undefined,
        limit: filterLimit,
      });

      // Client-side filter for ticket number/ID
      let filtered = data;
      if (filterTicket) {
        const search = filterTicket.toLowerCase();
        filtered = data.filter(
          (e) =>
            e.ticketNumber?.toLowerCase().includes(search) ||
            e.ticketId?.toLowerCase().includes(search)
        );
      }

      // Sort by timestamp descending (most recent first)
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEntries(filtered);
      setListConfigured(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error.message?.includes("not configured")) {
        setListConfigured(false);
      } else {
        setError("Failed to load activity log: " + (error.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, [accounts, instance, filterEventType, filterTicket, filterLimit]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Create the SharePoint list
  const handleCreateList = async () => {
    if (!accounts[0]) return;

    setCreatingList(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const listId = await createActivityLogList(client);
      setNewListId(listId);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to create list: " + (error.message || "Unknown error"));
    } finally {
      setCreatingList(false);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatTimestampFull = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Not configured state
  if (!listConfigured) {
    return (
      <div className="bg-bg-card rounded-xl p-8">
        <div className="text-center max-w-lg mx-auto">
          {newListId ? (
            <>
              <svg
                className="w-16 h-16 text-green-500 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Created!</h2>
              <p className="text-text-secondary mb-4">
                The ActivityLog list has been created. Complete these final steps:
              </p>
              <div className="text-left bg-bg-subtle rounded-lg p-4 text-sm mb-4">
                <ol className="list-decimal list-inside space-y-3 text-text-secondary">
                  <li>
                    <span className="font-medium">Copy this list ID:</span>
                    <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                      {newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">
                      Add to your <code className="bg-gray-200 px-1 rounded">.env.local</code> file:
                    </span>
                    <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                      NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID={newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">Restart the dev server</span>
                    <div className="mt-1 text-xs">
                      Run <code className="bg-gray-200 px-1 rounded">npm run dev</code>
                    </div>
                  </li>
                </ol>
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
              <svg
                className="w-16 h-16 text-yellow-500 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Not Configured</h2>
              <p className="text-text-secondary mb-4">
                The ActivityLog SharePoint list needs to be created to track system activity.
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
                  "Create ActivityLog List"
                )}
              </button>

              <p className="text-xs text-text-secondary">
                This will create a new SharePoint list to store activity logs.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Loading activity log...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
        <svg
          className="w-16 h-16 text-red-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadEntries}
          className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-text-primary">Activity Log</h2>
          <p className="text-sm text-text-secondary">
            Track all system events including tickets, comments, emails, and escalations.
          </p>
        </div>
        <button
          onClick={loadEntries}
          className="flex items-center gap-2 px-4 py-2 border border-border text-text-primary rounded-lg hover:bg-bg-subtle"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-bg-card rounded-xl p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-text-secondary mb-1">Event Type</label>
            <select
              value={filterEventType}
              onChange={(e) => setFilterEventType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">All Events</option>
              {EVENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {EVENT_TYPE_LABELS[type].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Ticket # or ID
            </label>
            <input
              type="text"
              value={filterTicket}
              onChange={(e) => setFilterTicket(e.target.value)}
              placeholder="Search by ticket..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="w-[120px]">
            <label className="block text-sm font-medium text-text-secondary mb-1">Limit</label>
            <select
              value={filterLimit}
              onChange={(e) => setFilterLimit(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-bg-card rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-16 h-16 text-text-secondary mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-text-secondary">No activity logged yet.</p>
            <p className="text-sm text-text-secondary mt-2">
              Activity will appear here as events occur in the system.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="p-4 hover:bg-bg-subtle transition-colors">
                <div className="flex items-start gap-4">
                  {/* Event Type Badge */}
                  <div className="flex-shrink-0">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        EVENT_TYPE_LABELS[entry.eventType]?.color || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {EVENT_TYPE_LABELS[entry.eventType]?.label || entry.eventType}
                    </span>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{entry.description}</p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-text-secondary">
                      {/* Ticket Link */}
                      {entry.ticketNumber && (
                        <span className="font-medium text-brand-primary">
                          Ticket #{entry.ticketNumber}
                        </span>
                      )}

                      {/* Actor */}
                      <span>by {entry.actorName || entry.actor}</span>

                      {/* Timestamp */}
                      <span title={formatTimestampFull(entry.timestamp)}>
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>

                    {/* Details (if any) */}
                    {entry.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                          View details
                        </summary>
                        <pre className="mt-1 p-2 bg-bg-subtle rounded text-xs overflow-x-auto">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(entry.details), null, 2);
                            } catch {
                              return entry.details;
                            }
                          })()}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {entries.length > 0 && (
        <div className="text-center text-sm text-text-secondary">
          Showing {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
      )}
    </div>
  );
}
