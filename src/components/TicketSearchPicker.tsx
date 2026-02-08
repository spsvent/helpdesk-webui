"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, searchTicketsForMerge } from "@/lib/graphClient";
import { Ticket } from "@/types/ticket";

interface TicketSearchPickerProps {
  excludeIds: string[];
  onSelect: (ticket: Ticket) => void;
  onCancel: () => void;
}

function getStatusBadgeClass(status: Ticket["status"]): string {
  const classes: Record<Ticket["status"], string> = {
    "New": "bg-blue-100 text-blue-800",
    "In Progress": "bg-green-100 text-green-800",
    "On Hold": "bg-yellow-100 text-yellow-800",
    "Resolved": "bg-emerald-100 text-emerald-800",
    "Closed": "bg-slate-100 text-slate-800",
  };
  return classes[status] || "bg-gray-100 text-gray-800";
}

export default function TicketSearchPicker({
  excludeIds,
  onSelect,
  onCancel,
}: TicketSearchPickerProps) {
  const { instance, accounts } = useMsal();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  const performSearch = useCallback(
    async (query: string) => {
      if (!accounts[0] || query.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const tickets = await searchTicketsForMerge(client, query, excludeIds);
        setResults(tickets);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Ticket search failed:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [accounts, instance, excludeIds]
  );

  // Handle search input change with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          onSelect(results[highlightedIndex]);
        }
        break;
      case "Escape":
        onCancel();
        break;
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by ticket #, title, or requester..."
          className="w-full px-3 py-2 pr-8 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {loading ? (
            <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {searchQuery.length >= 2 && (
        <div className="border border-border rounded-lg bg-bg-card max-h-48 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              No matching tickets found
            </div>
          ) : (
            <ul>
              {results.map((ticket, index) => (
                <li
                  key={ticket.id}
                  onClick={() => onSelect(ticket)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2 cursor-pointer ${
                    index === highlightedIndex ? "bg-brand-primary/10" : "hover:bg-bg-subtle"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brand-primary shrink-0">
                      #{ticket.ticketNumber || ticket.id}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusBadgeClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="text-sm text-text-primary truncate mt-0.5">
                    {ticket.title}
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {ticket.originalRequester || ticket.requester.displayName}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {searchQuery.length < 2 && searchQuery.length > 0 && (
        <div className="text-xs text-text-secondary">
          Type at least 2 characters to search
        </div>
      )}

      <button
        onClick={onCancel}
        className="text-sm text-text-secondary hover:text-text-primary"
      >
        Cancel
      </button>
    </div>
  );
}
