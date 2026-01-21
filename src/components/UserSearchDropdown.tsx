"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, searchUsers, OrgUser } from "@/lib/graphClient";
import UserAvatar from "./UserAvatar";

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
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const performSearch = useCallback(
    async (query: string) => {
      if (!accounts[0] || query.length < 2) {
        setUsers([]);
        return;
      }

      setLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const results = await searchUsers(client, query);
        setUsers(results);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Search failed:", error);
        setUsers([]);
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

  const handleSelectUser = (user: OrgUser) => {
    onChange(user);
    setSearchQuery("");
    setUsers([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery("");
    setUsers([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < users.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && users[highlightedIndex]) {
          handleSelectUser(users[highlightedIndex]);
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
        <div className="flex items-center gap-2 p-2 border border-border rounded-lg bg-white">
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
        <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {searchQuery.length < 2 ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              Type at least 2 characters to search
            </div>
          ) : loading ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              Searching...
            </div>
          ) : users.length === 0 ? (
            <div className="p-3 text-sm text-text-secondary text-center">
              No users found
            </div>
          ) : (
            <ul>
              {users.map((user, index) => (
                <li
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex items-center gap-3 p-2 cursor-pointer ${
                    index === highlightedIndex ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <UserAvatar name={user.displayName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{user.displayName}</div>
                    <div className="text-xs text-text-secondary truncate">
                      {user.email}
                      {user.jobTitle && ` - ${user.jobTitle}`}
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
