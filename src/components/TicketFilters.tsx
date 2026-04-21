"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  TicketFilters,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  DATE_RANGE_OPTIONS,
  SORT_OPTIONS,
  DEFAULT_FILTERS,
  EMPTY_FILTERS,
  PRESET_VIEWS,
  PresetView,
} from "@/types/filters";
import { Ticket } from "@/types/ticket";
import { getActiveFilterCount, filtersMatchDefault, getActiveFilterSummary } from "@/lib/filterUtils";
import { getProblemTypes, getProblemTypeSubs, getProblemTypeSub2s } from "@/lib/categoryConfig";

interface TicketFiltersProps {
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  totalCount: number;
  filteredCount: number;
  archivedLoaded: boolean;
  loadingArchived: boolean;
  onLoadArchived: () => void;
  tickets: Ticket[];  // For extracting unique assignees
}

export default function TicketFiltersComponent({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  archivedLoaded,
  loadingArchived,
  onLoadArchived,
  tickets,
}: TicketFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [activePreset, setActivePreset] = useState<PresetView | null>("default");

  // Keep a ref to latest filters so debounce doesn't close over stale state
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Debounce search input — only re-fires when user types, not on any filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filtersRef.current.search) {
        onFiltersChange({ ...filtersRef.current, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onFiltersChange]);

  const activeFilterCount = getActiveFilterCount(filters);

  // "Hide resolved" = status filter is explicit and does not include "Resolved".
  // Empty status ("all") means everything is visible, so the box is unchecked.
  const isHidingResolved =
    filters.status.length > 0 && !filters.status.includes("Resolved");

  const toggleHideResolved = useCallback(() => {
    setActivePreset(null);
    if (isHidingResolved) {
      // Re-show Resolved tickets
      onFiltersChange({ ...filters, status: [...filters.status, "Resolved"] });
      return;
    }
    // Start hiding Resolved. If currently "all", switch to an explicit list
    // containing every status except Resolved so the intent is preserved.
    const baseStatuses: Ticket["status"][] =
      filters.status.length === 0
        ? ["New", "In Progress", "On Hold", "Closed"]
        : filters.status.filter((s) => s !== "Resolved");
    onFiltersChange({ ...filters, status: baseStatuses });
  }, [filters, isHidingResolved, onFiltersChange]);

  // Extract unique assignees from tickets (check both assignedTo and originalAssignedTo)
  const uniqueAssignees = useMemo(() => {
    const assigneeMap = new Map<string, string>();
    tickets.forEach((ticket) => {
      // Check Person field first
      if (ticket.assignedTo?.email) {
        const email = ticket.assignedTo.email.toLowerCase();
        if (!assigneeMap.has(email)) {
          assigneeMap.set(email, ticket.assignedTo.displayName || ticket.originalAssignedTo || email);
        }
      }
      // Also check originalAssignedTo (auto-assigned tickets)
      if (ticket.originalAssignedTo) {
        const email = ticket.originalAssignedTo.toLowerCase();
        if (!assigneeMap.has(email)) {
          // Generate display name from email if needed
          const displayName = email.includes('@')
            ? email.split('@')[0].replace(/[._]/g, ' ')
            : email;
          assigneeMap.set(email, displayName);
        }
      }
    });
    return Array.from(assigneeMap.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  // Extract unique locations from tickets
  const uniqueLocations = useMemo(() => {
    const locationSet = new Set<string>();
    tickets.forEach((ticket) => {
      if (ticket.location) {
        locationSet.add(ticket.location);
      }
    });
    return Array.from(locationSet).sort();
  }, [tickets]);

  // Toggle status in multi-select
  const toggleStatus = useCallback(
    (status: Ticket["status"]) => {
      setActivePreset(null);
      const newStatus = filters.status.includes(status)
        ? filters.status.filter((s) => s !== status)
        : [...filters.status, status];
      onFiltersChange({ ...filters, status: newStatus });
    },
    [filters, onFiltersChange]
  );

  // Toggle priority in multi-select
  const togglePriority = useCallback(
    (priority: Ticket["priority"]) => {
      setActivePreset(null);
      const newPriority = filters.priority.includes(priority)
        ? filters.priority.filter((p) => p !== priority)
        : [...filters.priority, priority];
      onFiltersChange({ ...filters, priority: newPriority });
    },
    [filters, onFiltersChange]
  );

  // Handle cascading department filters
  const handleProblemTypeChange = useCallback(
    (value: string) => {
      setActivePreset(null);
      onFiltersChange({
        ...filters,
        problemType: value || null,
        problemTypeSub: null,
        problemTypeSub2: null,
      });
    },
    [filters, onFiltersChange]
  );

  const handleProblemTypeSubChange = useCallback(
    (value: string) => {
      setActivePreset(null);
      onFiltersChange({
        ...filters,
        problemTypeSub: value || null,
        problemTypeSub2: null,
      });
    },
    [filters, onFiltersChange]
  );

  const handleProblemTypeSub2Change = useCallback(
    (value: string) => {
      setActivePreset(null);
      onFiltersChange({
        ...filters,
        problemTypeSub2: value || null,
      });
    },
    [filters, onFiltersChange]
  );

  // Apply preset view
  const applyPreset = useCallback(
    (preset: PresetView) => {
      setActivePreset(preset);
      const presetConfig = PRESET_VIEWS[preset];
      onFiltersChange({
        ...DEFAULT_FILTERS,
        ...presetConfig.filters,
        search: searchInput, // Keep current search
      });
    },
    [onFiltersChange, searchInput]
  );

  // Clear all filters (show everything)
  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setActivePreset("all");
    setShowFilters(false);
    onFiltersChange({ ...EMPTY_FILTERS });
  }, [onFiltersChange]);

  // Reset to default view
  const resetToDefault = useCallback(() => {
    setSearchInput("");
    setActivePreset("default");
    setShowFilters(false);
    onFiltersChange({ ...DEFAULT_FILTERS });
  }, [onFiltersChange]);

  // Check if filters differ from default (for showing reset button)
  const hasCustomFilters = filters.search !== "" || !filtersMatchDefault(filters);

  // Get sub-category options based on selected parent
  const problemTypeSubs = filters.problemType
    ? getProblemTypeSubs(filters.problemType)
    : [];
  const problemTypeSub2s =
    filters.problemType && filters.problemTypeSub
      ? getProblemTypeSub2s(filters.problemType, filters.problemTypeSub)
      : [];

  return (
    <div className="border-b border-border">
      {/* Search and Sort Row */}
      <div className="p-3 space-y-2">
        {/* Search Input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Hide Resolved quick toggle — placed near search so it's always visible */}
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={isHidingResolved}
            onChange={toggleHideResolved}
            className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-2 focus:ring-brand-primary cursor-pointer"
          />
          Hide resolved tickets
        </label>

        {/* Preset View Buttons */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(Object.keys(PRESET_VIEWS) as PresetView[]).map((preset) => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              title={PRESET_VIEWS[preset].description}
              className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                activePreset === preset
                  ? "bg-brand-primary text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {PRESET_VIEWS[preset].label}
            </button>
          ))}
        </div>

        {/* Sort and Filter Toggle Row */}
        <div className="flex items-center gap-1.5">
          {/* Sort Dropdown */}
          <select
            value={filters.sort}
            onChange={(e) => {
              setActivePreset(null);
              onFiltersChange({ ...filters, sort: e.target.value as TicketFilters["sort"] });
            }}
            className="flex-1 text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary min-w-0"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Filter Toggle Button with Arrow */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs border rounded-lg transition-colors shrink-0 ${
              showFilters || activeFilterCount > 0
                ? "bg-brand-primary text-white border-brand-primary"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-white text-brand-primary text-xs font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
            {/* Collapse/Expand Arrow */}
            <svg
              className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active filter summary pills (when panel collapsed) */}
      {!showFilters && activeFilterCount > 0 && (
        <div className="px-3 pb-2 flex gap-1 overflow-hidden">
          {getActiveFilterSummary(filters).map((label) => (
            <span
              key={label}
              className="inline-block px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded-full whitespace-nowrap"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Collapsible Filter Panel */}
      {showFilters && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Status Chips */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Status{" "}
              <span className="font-normal text-gray-400">
                {filters.status.length === 0 ? "(all)" : `(${filters.status.length})`}
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    filters.status.includes(status)
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Chips */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Priority{" "}
              <span className="font-normal text-gray-400">
                {filters.priority.length === 0 ? "(all)" : `(${filters.priority.length})`}
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((priority) => (
                <button
                  key={priority}
                  onClick={() => togglePriority(priority)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    filters.priority.includes(priority)
                      ? priority === "Urgent"
                        ? "bg-red-600 text-white border-red-600"
                        : priority === "High"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-brand-primary text-white border-brand-primary"
                      : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>

          {/* Department Cascading Dropdowns */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Department
            </label>
            <div className="flex gap-2">
              <select
                value={filters.problemType || ""}
                onChange={(e) => handleProblemTypeChange(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">All</option>
                {getProblemTypes().map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              {problemTypeSubs.length > 0 && (
                <select
                  value={filters.problemTypeSub || ""}
                  onChange={(e) => handleProblemTypeSubChange(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">All</option>
                  {problemTypeSubs.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              )}

              {problemTypeSub2s.length > 0 && (
                <select
                  value={filters.problemTypeSub2 || ""}
                  onChange={(e) => handleProblemTypeSub2Change(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">All</option>
                  {problemTypeSub2s.map((sub2) => (
                    <option key={sub2} value={sub2}>
                      {sub2}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Category Toggle */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Category
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setActivePreset(null); onFiltersChange({ ...filters, category: null }); }}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  filters.category === null
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setActivePreset(null); onFiltersChange({ ...filters, category: "Request" }); }}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  filters.category === "Request"
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                Request
              </button>
              <button
                onClick={() => { setActivePreset(null); onFiltersChange({ ...filters, category: "Problem" }); }}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  filters.category === "Problem"
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                Problem
              </button>
            </div>
          </div>

          {/* Assignee Filter */}
          {uniqueAssignees.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Assignee
              </label>
              <select
                value={filters.assignee || ""}
                onChange={(e) => {
                  setActivePreset(null);
                  onFiltersChange({ ...filters, assignee: e.target.value || null });
                }}
                className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">All Assignees</option>
                {uniqueAssignees.map((assignee) => (
                  <option key={assignee.email} value={assignee.email}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Location Filter */}
          {uniqueLocations.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Location
              </label>
              <select
                value={filters.location || ""}
                onChange={(e) => {
                  setActivePreset(null);
                  onFiltersChange({ ...filters, location: e.target.value || null });
                }}
                className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">All Locations</option>
                {uniqueLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Date Range
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => {
                setActivePreset(null);
                onFiltersChange({
                  ...filters,
                  dateRange: e.target.value as TicketFilters["dateRange"],
                });
              }}
              className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear/Reset Buttons */}
          {hasCustomFilters && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={resetToDefault}
                className="flex-1 text-xs text-gray-600 hover:text-gray-800 py-1.5 border border-gray-300 rounded"
              >
                Reset to default
              </button>
              <button
                onClick={clearAllFilters}
                className="flex-1 text-xs text-red-600 hover:text-red-700 py-1.5 border border-red-200 rounded"
              >
                Show all tickets
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results Count */}
      {(filteredCount !== totalCount || searchInput) && (
        <div className="px-3 py-2 text-xs text-text-secondary bg-gray-50 border-t border-border">
          Showing {filteredCount} of {totalCount} tickets
        </div>
      )}

      {/* Load Archived Tickets */}
      {!archivedLoaded && (
        <div className="px-3 py-2 border-t border-border bg-gray-50">
          <button
            onClick={onLoadArchived}
            disabled={loadingArchived}
            className="w-full text-xs text-center py-1.5 text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loadingArchived ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading archived tickets...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Load archived tickets (90+ days old)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
