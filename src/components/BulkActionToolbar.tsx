"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getGraphClient,
  bulkUpdateStatus,
  bulkUpdatePriority,
  bulkReassign,
  bulkMergeTickets,
  BulkUpdateResult,
  BulkMergeResult,
  searchUsersAndGroups,
  OrgUser,
  OrgGroup,
} from "@/lib/graphClient";
import { Ticket } from "@/types/ticket";

// Combined type for search results
type SearchResult = (OrgUser & { type: "user" }) | (OrgGroup & { type: "group" });

interface BulkActionToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
  tickets?: Ticket[];
}

const STATUS_OPTIONS = ["New", "In Progress", "On Hold", "Resolved", "Closed"];
const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];

export default function BulkActionToolbar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  tickets,
}: BulkActionToolbarProps) {
  const { instance, accounts } = useMsal();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeResults, setAssigneeResults] = useState<SearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [lastResults, setLastResults] = useState<BulkUpdateResult[] | null>(null);
  const [lastMergeResults, setLastMergeResults] = useState<BulkMergeResult[] | null>(null);

  const closeAllMenus = () => {
    setShowStatusMenu(false);
    setShowPriorityMenu(false);
    setShowAssignMenu(false);
    setShowMergeMenu(false);
    setShowMergeConfirm(false);
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (!accounts[0]) return;
    closeAllMenus();
    setIsProcessing(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const results = await bulkUpdateStatus(client, selectedIds, newStatus);
      setLastResults(results);

      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        onActionComplete();
      }
    } catch (error) {
      console.error("Bulk status update failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkPriority = async (newPriority: string) => {
    if (!accounts[0]) return;
    closeAllMenus();
    setIsProcessing(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const results = await bulkUpdatePriority(client, selectedIds, newPriority);
      setLastResults(results);

      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        onActionComplete();
      }
    } catch (error) {
      console.error("Bulk priority update failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssigneeSearch = async (query: string) => {
    setAssigneeSearch(query);

    if (query.length < 2) {
      setAssigneeResults([]);
      return;
    }

    if (!accounts[0]) return;
    setSearchingUsers(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const { users, groups } = await searchUsersAndGroups(client, query);

      // Combine and tag results
      const combined: SearchResult[] = [
        ...users.map(u => ({ ...u, type: "user" as const })),
        ...groups.filter(g => g.mail).map(g => ({ ...g, type: "group" as const })),
      ];

      // Sort by displayName
      combined.sort((a, b) => a.displayName.localeCompare(b.displayName));

      setAssigneeResults(combined);
    } catch (error) {
      console.error("User search failed:", error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleBulkAssign = async (result: SearchResult) => {
    if (!accounts[0]) return;
    closeAllMenus();
    setIsProcessing(true);

    // Get the email - for users it's .email, for groups it's .mail
    const email = result.type === "user" ? result.email : (result.mail || "");

    if (!email) {
      console.error("No email found for assignee");
      setIsProcessing(false);
      return;
    }

    try {
      const client = getGraphClient(instance, accounts[0]);
      const results = await bulkReassign(client, selectedIds, email);
      setLastResults(results);

      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        onActionComplete();
      }
    } catch (error) {
      console.error("Bulk assign failed:", error);
    } finally {
      setIsProcessing(false);
      setAssigneeSearch("");
      setAssigneeResults([]);
    }
  };

  // Handle selecting primary for merge
  const handleSelectMergePrimary = (primaryId: string) => {
    setMergePrimaryId(primaryId);
    setShowMergeMenu(false);
    setShowMergeConfirm(true);
  };

  // Handle bulk merge confirm
  const handleBulkMerge = async () => {
    if (!accounts[0] || !mergePrimaryId || !tickets) return;
    closeAllMenus();
    setIsProcessing(true);

    const primaryTicket = tickets.find((t) => t.id === mergePrimaryId);
    if (!primaryTicket) {
      setIsProcessing(false);
      return;
    }

    const secondaryTickets = selectedIds
      .filter((id) => id !== mergePrimaryId)
      .map((id) => {
        const t = tickets.find((ticket) => ticket.id === id);
        return {
          id,
          ticketNumber: (t?.ticketNumber || id).toString(),
        };
      });

    try {
      const client = getGraphClient(instance, accounts[0]);
      const results = await bulkMergeTickets(
        client,
        secondaryTickets,
        primaryTicket.id,
        (primaryTicket.ticketNumber || primaryTicket.id).toString(),
        {
          email: accounts[0].username,
          name: accounts[0].name || accounts[0].username,
        }
      );
      setLastMergeResults(results);

      const mergeSuccessCount = results.filter((r) => r.success).length;
      if (mergeSuccessCount > 0) {
        onActionComplete();
      }
    } catch (error) {
      console.error("Bulk merge failed:", error);
    } finally {
      setIsProcessing(false);
      setMergePrimaryId(null);
    }
  };

  // Get selected tickets data for merge UI
  const selectedTickets = tickets
    ? selectedIds.map((id) => tickets.find((t) => t.id === id)).filter(Boolean) as Ticket[]
    : [];

  const successCount = lastResults?.filter((r) => r.success).length ?? 0;
  const errorCount = lastResults?.filter((r) => !r.success).length ?? 0;
  const mergeSuccessCount = lastMergeResults?.filter((r) => r.success).length ?? 0;
  const mergeErrorCount = lastMergeResults?.filter((r) => !r.success).length ?? 0;

  if (selectedIds.length === 0) return null;

  return (
    <div className="bg-brand-primary text-white px-4 py-2 flex items-center justify-between gap-4 rounded-t-lg">
      <div className="flex items-center gap-4">
        <span className="font-medium">
          {selectedIds.length} ticket{selectedIds.length !== 1 ? "s" : ""} selected
        </span>

        {/* Status dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              closeAllMenus();
              setShowStatusMenu(!showStatusMenu);
            }}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            Set Status
          </button>
          {showStatusMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-card rounded-lg shadow-lg border border-border py-1 z-50 min-w-[140px]">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  onClick={() => handleBulkStatus(status)}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-subtle transition-colors"
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              closeAllMenus();
              setShowPriorityMenu(!showPriorityMenu);
            }}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            Set Priority
          </button>
          {showPriorityMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-card rounded-lg shadow-lg border border-border py-1 z-50 min-w-[120px]">
              {PRIORITY_OPTIONS.map((priority) => (
                <button
                  key={priority}
                  onClick={() => handleBulkPriority(priority)}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-subtle transition-colors"
                >
                  {priority}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assign dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              closeAllMenus();
              setShowAssignMenu(!showAssignMenu);
            }}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reassign
          </button>
          {showAssignMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-card rounded-lg shadow-lg border border-border py-2 z-50 min-w-[250px]">
              <div className="px-2 pb-2">
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={(e) => handleAssigneeSearch(e.target.value)}
                  placeholder="Search users or groups..."
                  className="w-full px-3 py-1.5 border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  autoFocus
                />
              </div>
              {searchingUsers && (
                <div className="px-3 py-2 text-sm text-text-secondary">
                  Searching...
                </div>
              )}
              {!searchingUsers && assigneeResults.length === 0 && assigneeSearch.length >= 2 && (
                <div className="px-3 py-2 text-sm text-text-secondary">
                  No users or groups found
                </div>
              )}
              {assigneeResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleBulkAssign(result)}
                  className="w-full px-3 py-2 text-left hover:bg-bg-subtle transition-colors"
                >
                  <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                    {result.displayName}
                    {result.type === "group" && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Group</span>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {result.type === "user" ? result.email : result.mail}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Merge dropdown (requires 2+ selected) */}
        {selectedIds.length >= 2 && tickets && (
          <div className="relative">
            <button
              onClick={() => {
                closeAllMenus();
                setShowMergeMenu(!showMergeMenu);
              }}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              Merge
            </button>
            {showMergeMenu && (
              <div className="absolute top-full left-0 mt-1 bg-bg-card rounded-lg shadow-lg border border-border py-1 z-50 min-w-[280px]">
                <div className="px-3 py-2 text-xs text-text-secondary font-medium border-b border-border">
                  Select primary ticket (others will merge into it):
                </div>
                {selectedTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectMergePrimary(t.id)}
                    className="w-full px-3 py-2 text-left hover:bg-bg-subtle transition-colors"
                  >
                    <div className="text-sm font-medium text-text-primary">
                      #{t.ticketNumber || t.id}
                    </div>
                    <div className="text-xs text-text-secondary truncate">
                      {t.title}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showMergeConfirm && mergePrimaryId && (
              <div className="absolute top-full left-0 mt-1 bg-bg-card rounded-lg shadow-lg border border-border p-3 z-50 min-w-[280px]">
                <div className="text-sm font-medium text-text-primary mb-2">
                  Confirm Bulk Merge
                </div>
                <div className="text-sm text-text-secondary mb-3">
                  {selectedIds.length - 1} ticket{selectedIds.length - 1 !== 1 ? "s" : ""} will be merged into #{tickets.find((t) => t.id === mergePrimaryId)?.ticketNumber || mergePrimaryId} and closed.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkMerge}
                    className="flex-1 px-3 py-1.5 bg-teal-600 text-white text-sm rounded font-medium hover:bg-teal-700 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setShowMergeConfirm(false);
                      setMergePrimaryId(null);
                    }}
                    className="px-3 py-1.5 border border-border text-text-secondary text-sm rounded hover:bg-bg-subtle transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Processing...
          </div>
        )}

        {lastResults && !isProcessing && (
          <span className="text-sm">
            {successCount > 0 && (
              <span className="text-green-200">{successCount} updated</span>
            )}
            {errorCount > 0 && (
              <span className="text-red-200 ml-2">{errorCount} failed</span>
            )}
          </span>
        )}

        {lastMergeResults && !isProcessing && (
          <span className="text-sm">
            {mergeSuccessCount > 0 && (
              <span className="text-green-200">{mergeSuccessCount} merged</span>
            )}
            {mergeErrorCount > 0 && (
              <span className="text-red-200 ml-2">{mergeErrorCount} failed</span>
            )}
          </span>
        )}
      </div>

      <button
        onClick={() => {
          onClearSelection();
          setLastResults(null);
          setLastMergeResults(null);
        }}
        className="text-white/80 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
