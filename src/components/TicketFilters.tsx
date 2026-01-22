"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { getActiveFilterCount } from "@/lib/filterUtils";
import { getProblemTypes, getProblemTypeSubs, getProblemTypeSub2s } from "@/lib/categoryConfig";
import { getLocations } from "@/lib/locationConfig";

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
  const [activePreset, setActivePreset] = useState<PresetView>("default");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters, onFiltersChange]);

  const activeFilterCount = getActiveFilterCount(filters);

  // Extract unique assignees from tickets
  const uniqueAssignees = useMemo(() => {
    const assigneeMap = new Map<string, string>();
    tickets.forEach((ticket) => {
      if (ticket.assignedTo?.email) {
        const email = ticket.assignedTo.email.toLowerCase();
        if (!assigneeMap.has(email)) {
          assigneeMap.set(email, ticket.assignedTo.displayName || ticket.originalAssignedTo || email);
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
    onFiltersChange({ ...EMPTY_FILTERS });
  }, [onFiltersChange]);

  // Reset to default view
  const resetToDefault = useCallback(() => {
    setSearchInput("");
    setActivePreset("default");
    onFiltersChange({ ...DEFAULT_FILTERS });
  }, [onFiltersChange]);

  // Check if filters differ from default (for showing reset button)
  const hasCustomFilters =
    filters.search !== "" ||
    filters.priority.length > 0 ||
    filters.problemType !== null ||
    filters.category !== null ||
    filters.assignee !== null ||
    filters.location !== null ||
    filters.dateRange !== "all" ||
    // Check if status differs from default
    JSON.stringify([...filters.status].sort()) !== JSON.stringify([...DEFAULT_FILTERS.status].sort());

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
              setActivePreset("default"); // Clear preset when manually changing sort
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

      {/* Collapsible Filter Panel */}
      {showFilters && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Status Chips */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Status
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
              Priority
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
                onClick={() => onFiltersChange({ ...filters, category: null })}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  filters.category === null
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => onFiltersChange({ ...filters, category: "Request" })}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  filters.category === "Request"
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                Request
              </button>
              <button
                onClick={() => onFiltersChange({ ...filters, category: "Problem" })}
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
                onChange={(e) =>
                  onFiltersChange({ ...filters, assignee: e.target.value || null })
                }
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
                onChange={(e) =>
                  onFiltersChange({ ...filters, location: e.target.value || null })
                }
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
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  dateRange: e.target.value as TicketFilters["dateRange"],
                })
              }
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
