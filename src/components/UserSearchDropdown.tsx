"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, searchUsersAndGroups, OrgUser, OrgGroup } from "@/lib/graphClient";
import UserAvatar from "./UserAvatar";

// Combined type for search results
type SearchResult = (OrgUser & { type: "user" }) | (OrgGroup & { type: "group" });

interface UserSearchDropdownProps {
  value?: { displayName: string; email: string } | null;
  onChange: (user: OrgUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function UserSearchDropdown({
  value,
  onChange,
  placeholder = "Search for a user...",
  disabled = false,
}: UserSearchDropdownProps) {
  const { instance, accounts } = useMsal();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search - searches both users and groups
  const performSearch = useCallback(
    async (query: string) => {
      if (!accounts[0] || query.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const { users, groups } = await searchUsersAndGroups(client, query);

        // Combine and tag results
        const combined: SearchResult[] = [
          ...users.map(u => ({ ...u, type: "user" as const })),
          ...groups.filter(g => g.mail).map(g => ({ ...g, type: "group" as const })), // Only groups with email
        ];

        // Sort by displayName
        combined.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setResults(combined);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [accounts, instance]
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
  };

  const handleSelectResult = (result: SearchResult) => {
    // Convert to OrgUser format for the onChange callback
    const asUser: OrgUser = {
      id: result.id,
      displayName: result.displayName,
      email: result.type === "user" ? result.email : (result.mail || ""),
      jobTitle: result.type === "user" ? result.jobTitle : undefined,
      department: result.type === "user" ? result.department : undefined,
      userPrincipalName: result.type === "user" ? result.userPrincipalName : (result.mail || ""),
    };
    onChange(asUser);
    setSearchQuery("");
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

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
          handleSelectResult(results[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected user or search input */}
      {value && !isOpen ? (
        <div className="flex items-center gap-2 p-2 border border-border rounded-lg bg-bg-card">
          <UserAvatar name={value.displayName} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{value.displayName}</div>
            {value.email && (
              <div className="text-xs text-text-secondary truncate">{value.email}</div>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded"
              title="Clear selection"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-3 py-2 pr-8 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-50 disabled:cursor-not-allowed"
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
      )}

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {searchQuery.length < 2 ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              Type at least 2 characters to search
            </div>
          ) : loading ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              No users or groups found
            </div>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li
                  key={result.id}
                  onClick={() => handleSelectResult(result)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex items-center gap-3 p-2 cursor-pointer ${
                    index === highlightedIndex ? "bg-brand-primary/10" : "hover:bg-bg-subtle"
                  }`}
                >
                  {result.type === "group" ? (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  ) : (
                    <UserAvatar name={result.displayName} size="sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {result.displayName}
                      {result.type === "group" && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Group</span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary truncate">
                      {result.type === "user" ? (
                        <>
                          {result.email}
                          {result.jobTitle && ` - ${result.jobTitle}`}
                        </>
                      ) : (
                        result.mail || "No email"
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
