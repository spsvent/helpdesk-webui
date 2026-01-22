"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getGraphClient,
  bulkUpdateStatus,
  bulkUpdatePriority,
  bulkReassign,
  BulkUpdateResult,
  searchUsers,
  OrgUser,
} from "@/lib/graphClient";

interface BulkActionToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

const STATUS_OPTIONS = ["New", "In Progress", "On Hold", "Resolved", "Closed"];
const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];

export default function BulkActionToolbar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionToolbarProps) {
  const { instance, accounts } = useMsal();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeResults, setAssigneeResults] = useState<OrgUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [lastResults, setLastResults] = useState<BulkUpdateResult[] | null>(null);

  const closeAllMenus = () => {
    setShowStatusMenu(false);
    setShowPriorityMenu(false);
    setShowAssignMenu(false);
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
      const users = await searchUsers(client, query);
      setAssigneeResults(users);
    } catch (error) {
      console.error("User search failed:", error);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleBulkAssign = async (user: OrgUser) => {
    if (!accounts[0]) return;
    closeAllMenus();
    setIsProcessing(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const results = await bulkReassign(client, selectedIds, user.email);
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

  const successCount = lastResults?.filter((r) => r.success).length ?? 0;
  const errorCount = lastResults?.filter((r) => !r.success).length ?? 0;

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
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-border py-1 z-50 min-w-[140px]">
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
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-border py-1 z-50 min-w-[120px]">
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
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-border py-2 z-50 min-w-[250px]">
              <div className="px-2 pb-2">
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={(e) => handleAssigneeSearch(e.target.value)}
                  placeholder="Search users..."
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
                  No users found
                </div>
              )}
              {assigneeResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleBulkAssign(user)}
                  className="w-full px-3 py-2 text-left hover:bg-bg-subtle transition-colors"
                >
                  <div className="text-sm font-medium text-text-primary">
                    {user.displayName}
                  </div>
                  <div className="text-xs text-text-secondary">{user.email}</div>
                </button>
              ))}
            </div>
          )}
        </div>

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
      </div>

      <button
        onClick={() => {
          onClearSelection();
          setLastResults(null);
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
