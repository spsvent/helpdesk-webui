"use client";

import { useEffect, useState, useMemo } from "react";
import { Client } from "@microsoft/microsoft-graph-client";
import { resolveAssigneeInfo, AssigneeInfo } from "@/lib/assigneePreviewService";

// Get hierarchy rank for sorting (lower = higher in hierarchy)
function getHierarchyRank(jobTitle: string | undefined): number {
  if (!jobTitle) return 99;
  const title = jobTitle.toLowerCase();

  // Director level
  if (title.includes("director")) return 0;
  // Manager level
  if (title.includes("manager")) return 1;
  // Supervisor level
  if (title.includes("supervisor") || title.includes("lead")) return 2;
  // Senior level
  if (title.includes("senior")) return 3;
  // Assistant/Associate level
  if (title.includes("assistant") || title.includes("associate")) return 5;
  // Default for all other positions
  return 4;
}

interface AssigneePreviewProps {
  assigneeEmail: string | null;
  client: Client | null;
  groupId?: string; // Optional Entra group ID for direct lookup
}

export default function AssigneePreview({ assigneeEmail, client, groupId }: AssigneePreviewProps) {
  const [assignees, setAssignees] = useState<AssigneeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAssigneeInfo() {
      if (!assigneeEmail || !client) {
        setAssignees([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const info = await resolveAssigneeInfo(client, assigneeEmail, groupId);
        setAssignees(info);
      } catch (err) {
        console.error("Failed to resolve assignee info:", err);
        setError("Could not load assignee information");
        setAssignees([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAssigneeInfo();
  }, [assigneeEmail, client, groupId]);

  // Sort assignees by hierarchy (manager > supervisor > others > assistant)
  const sortedAssignees = useMemo(() => {
    return [...assignees].sort((a, b) => {
      const rankA = getHierarchyRank(a.jobTitle);
      const rankB = getHierarchyRank(b.jobTitle);
      if (rankA !== rankB) return rankA - rankB;
      // Secondary sort by name if same rank
      return a.displayName.localeCompare(b.displayName);
    });
  }, [assignees]);

  // Don't render if no assignee
  if (!assigneeEmail) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">Assigned To</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Looking up assignee...</span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && assignees.length === 0 && (
        <p className="text-sm text-gray-500 italic">No assignee information available</p>
      )}

      {!loading && !error && sortedAssignees.length > 0 && (
        <div className="space-y-1">
          {sortedAssignees.length === 1 ? (
            // Single user
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand-primary/20 flex items-center justify-center">
                <span className="text-xs font-medium text-brand-primary">
                  {sortedAssignees[0].displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {sortedAssignees[0].jobTitle || sortedAssignees[0].displayName}
                </p>
                {sortedAssignees[0].jobTitle && (
                  <p className="text-xs text-gray-500">{sortedAssignees[0].displayName}</p>
                )}
              </div>
            </div>
          ) : (
            // Multiple users (group)
            <div>
              <p className="text-xs text-gray-500 mb-2">
                {sortedAssignees.length} team members will be notified:
              </p>
              <ul className="space-y-1 pl-2 border-l-2 border-gray-200">
                {sortedAssignees.map((assignee, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium text-gray-700">
                      {assignee.jobTitle || assignee.displayName}
                    </span>
                    {assignee.jobTitle && (
                      <span className="text-gray-400 ml-1">({assignee.displayName})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
