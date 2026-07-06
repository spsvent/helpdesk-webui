"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  TicketFilters,
  SortOption,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  DATE_RANGE_OPTIONS,
  SORT_OPTIONS,
  DEFAULT_FILTERS,
} from "@/types/filters";
import { Ticket } from "@/types/ticket";
import { UserPermissions } from "@/types/rbac";
import { arraysEqual } from "@/lib/filterUtils";
import { getProblemTypes, getProblemTypeSubs, getProblemTypeSub2s } from "@/lib/categoryConfig";

interface TicketFiltersProps {
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  totalCount: number;
  filteredCount: number;
  archivedLoaded: boolean;
  loadingArchived: boolean;
  onLoadArchived: () => void;
  tickets: Ticket[]; // For extracting unique assignees / locations
  permissions?: UserPermissions | null; // Drives role-aware quick-filter chips
}

// Shortened sort labels shown on the always-visible Sort pill.
const SORT_SHORT: Record<SortOption, string> = {
  default: "Smart",
  urgency: "Priority",
  recent: "Newest",
  oldest: "Oldest",
};

// Toggle a value in/out of an array (immutable).
function toggleValue<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/* ------------------------------------------------------------------ */
/* Dropdown primitives                                                 */
/* ------------------------------------------------------------------ */

// A filter dropdown: a trigger pill (bold label + optional value/count) plus a
// popover of options. Opens on click, closes on outside mousedown.
function FilterDropdown({
  label,
  value,
  count,
  active,
  width = 200,
  children,
}: {
  label: string;
  value?: string | null;
  count?: number | null;
  active?: boolean;
  width?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const highlighted = active || open;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[12.5px] leading-none border whitespace-nowrap transition-colors ${
          highlighted ? "border-brand-primary text-brand-primary" : "border-border text-text-primary"
        } ${active ? "bg-brand-primary/[0.08]" : "bg-bg-card"}`}
      >
        <span className="font-bold">{label}</span>
        {value != null && value !== "" && (
          <span className="font-normal text-text-secondary">{value}</span>
        )}
        {count != null && count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-primary text-white text-[11px] font-bold">
            {count}
          </span>
        )}
        <svg
          className={`w-3 h-3 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-30 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden py-1"
          style={{ width }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  label,
  checked,
  onClick,
  radio = false,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  radio?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-brand-primary/[0.08] transition-colors"
    >
      <span
        className={`w-4 h-4 shrink-0 inline-flex items-center justify-center border-[1.5px] ${
          radio ? "rounded-full" : "rounded"
        } ${checked ? "border-brand-primary" : "border-border"} ${
          checked && !radio ? "bg-brand-primary" : "bg-transparent"
        }`}
      >
        {checked &&
          (radio ? (
            <span className="w-2 h-2 rounded-full bg-brand-primary" />
          ) : (
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ))}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ClearRow({ onClick, label = "Clear" }: { onClick: () => void; label?: string }) {
  return (
    <>
      <div className="h-px bg-border my-1" />
      <button
        type="button"
        onClick={onClick}
        className="block w-full px-3 py-2 text-left text-[13px] font-semibold text-brand-primary hover:bg-brand-primary/[0.08] transition-colors"
      >
        {label}
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Filter bar                                                          */
/* ------------------------------------------------------------------ */

export default function TicketFiltersComponent({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  archivedLoaded,
  loadingArchived,
  onLoadArchived,
  tickets,
  permissions,
}: TicketFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);

  // Keep a ref to latest filters so the search debounce doesn't close over stale state.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Keep the local search box in sync when filters are reset elsewhere (presets, clear).
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Debounce search input — only re-fires when the user types.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filtersRef.current.search) {
        onFiltersChange({ ...filtersRef.current, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onFiltersChange]);

  const set = useCallback(
    (patch: Partial<TicketFilters>) => onFiltersChange({ ...filters, ...patch }),
    [filters, onFiltersChange]
  );

  // "Show resolved & closed" is ON when either Resolved or Closed is in the status set.
  const isShowingResolvedClosed =
    filters.status.includes("Resolved") || filters.status.includes("Closed");

  const toggleShowResolvedClosed = useCallback(() => {
    if (isShowingResolvedClosed) {
      const remaining = filters.status.filter((s) => s !== "Resolved" && s !== "Closed");
      const base: Ticket["status"][] =
        remaining.length > 0 ? remaining : ["New", "In Progress", "On Hold"];
      set({ status: base });
      return;
    }
    set({
      status: Array.from(new Set<Ticket["status"]>([...filters.status, "Resolved", "Closed"])),
    });
  }, [filters.status, isShowingResolvedClosed, set]);

  const toggleQuickFilter = useCallback(
    (key: "myDepartmentOnly" | "assignedToMeOnly" | "requestedByMeOnly" | "unassignedOnly") => {
      set({ [key]: !filters[key] } as Partial<TicketFilters>);
    },
    [filters, set]
  );

  const isUrgentActive = filters.priority.includes("Urgent");
  const toggleUrgent = useCallback(() => {
    set({ priority: toggleValue(filters.priority, "Urgent" as Ticket["priority"]) });
  }, [filters.priority, set]);

  // Which quick chips to show, based on role (unchanged from the previous bar).
  const role = permissions?.role;
  const showMyDept = role === "support" && (permissions?.editableDepartments.length ?? 0) > 0;
  const showAssignedToMe = role === "support" || role === "admin";
  const showUnassigned = role === "support" || role === "admin";
  const showMyRequests = !!permissions;

  const chipClass = (activeChip: boolean, red = false) =>
    `px-2.5 py-1 text-xs rounded-full border transition-colors ${
      activeChip
        ? red
          ? "bg-red-600 text-white border-red-600"
          : "bg-brand-primary text-white border-brand-primary"
        : "border-border text-text-primary hover:bg-brand-primary/[0.06]"
    }`;

  // Unique assignees + locations for the "More" panel selects.
  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.assignedTo?.email) {
        const e = t.assignedTo.email.toLowerCase();
        if (!map.has(e)) map.set(e, t.assignedTo.displayName || t.originalAssignedTo || e);
      }
      if (t.originalAssignedTo) {
        const e = t.originalAssignedTo.toLowerCase();
        if (!map.has(e)) map.set(e, e.includes("@") ? e.split("@")[0].replace(/[._]/g, " ") : e);
      }
    });
    return Array.from(map.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const uniqueLocations = useMemo(() => {
    const set2 = new Set<string>();
    tickets.forEach((t) => t.location && set2.add(t.location));
    return Array.from(set2).sort();
  }, [tickets]);

  // Cascading sub-department options (surfaced inside "More" when a department is chosen).
  const problemTypeSubs = filters.problemType ? getProblemTypeSubs(filters.problemType) : [];
  const problemTypeSub2s =
    filters.problemType && filters.problemTypeSub
      ? getProblemTypeSub2s(filters.problemType, filters.problemTypeSub)
      : [];

  const handleProblemTypeChange = useCallback(
    (value: string) => set({ problemType: value || null, problemTypeSub: null, problemTypeSub2: null }),
    [set]
  );

  // Count of active "More" filters (for its pill badge).
  const moreCount =
    (filters.problemTypeSub ? 1 : 0) +
    (filters.problemTypeSub2 ? 1 : 0) +
    (filters.assignee ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.dateRange !== "all" ? 1 : 0) +
    (filters.myDepartmentOnly ? 1 : 0) +
    (filters.assignedToMeOnly ? 1 : 0) +
    (filters.requestedByMeOnly ? 1 : 0) +
    (filters.unassignedOnly ? 1 : 0);

  // Total active-filter count for the "Clear filters (n)" affordance (deviations
  // from the default view). Status counts once if it differs from the default set.
  const statusChanged = !arraysEqual(filters.status, DEFAULT_FILTERS.status);
  const clearCount =
    (statusChanged ? 1 : 0) +
    (filters.priority.length > 0 ? 1 : 0) +
    (filters.category != null ? 1 : 0) +
    (filters.problemType != null ? 1 : 0) +
    (filters.assignee ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.dateRange !== "all" ? 1 : 0) +
    (filters.myDepartmentOnly ? 1 : 0) +
    (filters.assignedToMeOnly ? 1 : 0) +
    (filters.requestedByMeOnly ? 1 : 0) +
    (filters.unassignedOnly ? 1 : 0) +
    (filters.approvalStatus && filters.approvalStatus.length > 0 ? 1 : 0);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    onFiltersChange({ ...DEFAULT_FILTERS });
  }, [onFiltersChange]);

  return (
    <div className="border-b border-border">
      <div className="p-3 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tickets…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Dropdown pill row */}
        <div className="flex flex-wrap gap-2">
          {/* Sort — always shows its (shortened) value */}
          <FilterDropdown label="Sort" value={SORT_SHORT[filters.sort]} width={200}>
            {SORT_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                radio
                label={opt.label}
                checked={filters.sort === opt.value}
                onClick={() => set({ sort: opt.value })}
              />
            ))}
          </FilterDropdown>

          {/* Status — count badge only when active */}
          <FilterDropdown label="Status" count={filters.status.length} active={filters.status.length > 0} width={200}>
            {STATUS_OPTIONS.map((s) => (
              <OptionRow
                key={s}
                label={s}
                checked={filters.status.includes(s)}
                onClick={() => set({ status: toggleValue(filters.status, s) })}
              />
            ))}
            {filters.status.length > 0 && <ClearRow onClick={() => set({ status: [] })} />}
          </FilterDropdown>

          {/* Priority — count badge only when active */}
          <FilterDropdown label="Priority" count={filters.priority.length} active={filters.priority.length > 0} width={180}>
            {PRIORITY_OPTIONS.map((p) => (
              <OptionRow
                key={p}
                label={p}
                checked={filters.priority.includes(p)}
                onClick={() => set({ priority: toggleValue(filters.priority, p) })}
              />
            ))}
            {filters.priority.length > 0 && <ClearRow onClick={() => set({ priority: [] })} />}
          </FilterDropdown>

          {/* Category — value only when non-default */}
          <FilterDropdown label="Category" value={filters.category} active={filters.category != null} width={180}>
            <OptionRow radio label="All" checked={filters.category == null} onClick={() => set({ category: null })} />
            <OptionRow radio label="Request" checked={filters.category === "Request"} onClick={() => set({ category: "Request" })} />
            <OptionRow radio label="Problem" checked={filters.category === "Problem"} onClick={() => set({ category: "Problem" })} />
          </FilterDropdown>

          {/* Department — value only when non-default */}
          <FilterDropdown label="Department" value={filters.problemType} active={filters.problemType != null} width={220}>
            <OptionRow radio label="All" checked={filters.problemType == null} onClick={() => handleProblemTypeChange("")} />
            {getProblemTypes().map((t) => (
              <OptionRow
                key={t}
                radio
                label={t}
                checked={filters.problemType === t}
                onClick={() => handleProblemTypeChange(t)}
              />
            ))}
          </FilterDropdown>

          {/* More — the extras that don't warrant a top-level pill */}
          <FilterDropdown label="More" count={moreCount} active={moreCount > 0} width={260}>
            <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Quick filters */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                  Quick filters
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {showMyDept && (
                    <button onClick={() => toggleQuickFilter("myDepartmentOnly")} className={chipClass(filters.myDepartmentOnly)}>
                      My Dept
                    </button>
                  )}
                  {showAssignedToMe && (
                    <button onClick={() => toggleQuickFilter("assignedToMeOnly")} className={chipClass(filters.assignedToMeOnly)}>
                      Assigned to me
                    </button>
                  )}
                  {showMyRequests && (
                    <button onClick={() => toggleQuickFilter("requestedByMeOnly")} className={chipClass(filters.requestedByMeOnly)}>
                      My requests
                    </button>
                  )}
                  {showUnassigned && (
                    <button onClick={() => toggleQuickFilter("unassignedOnly")} className={chipClass(filters.unassignedOnly)}>
                      Unassigned
                    </button>
                  )}
                  <button onClick={toggleUrgent} className={chipClass(isUrgentActive, true)}>
                    Urgent
                  </button>
                </div>
              </div>

              {/* Show resolved & closed */}
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isShowingResolvedClosed}
                  onChange={toggleShowResolvedClosed}
                  className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-2 focus:ring-brand-primary cursor-pointer"
                />
                Show resolved &amp; closed
              </label>

              {/* Sub-Category (cascades from Department) */}
              {problemTypeSubs.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Sub-Category
                  </label>
                  <select
                    value={filters.problemTypeSub || ""}
                    onChange={(e) => set({ problemTypeSub: e.target.value || null, problemTypeSub2: null })}
                    className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">All</option>
                    {problemTypeSubs.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Specific Type */}
              {problemTypeSub2s.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Specific Type
                  </label>
                  <select
                    value={filters.problemTypeSub2 || ""}
                    onChange={(e) => set({ problemTypeSub2: e.target.value || null })}
                    className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">All</option>
                    {problemTypeSub2s.map((sub2) => (
                      <option key={sub2} value={sub2}>
                        {sub2}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Assignee */}
              {uniqueAssignees.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Assignee
                  </label>
                  <select
                    value={filters.assignee || ""}
                    onChange={(e) => set({ assignee: e.target.value || null })}
                    className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">All Assignees</option>
                    {uniqueAssignees.map((a) => (
                      <option key={a.email} value={a.email}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location */}
              {uniqueLocations.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Location
                  </label>
                  <select
                    value={filters.location || ""}
                    onChange={(e) => set({ location: e.target.value || null })}
                    className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Date Range
                </label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => set({ dateRange: e.target.value as TicketFilters["dateRange"] })}
                  className="w-full text-xs px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  {DATE_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </FilterDropdown>
        </div>

        {/* Count + clear */}
        <div className="flex items-center justify-between text-[13px] text-text-secondary">
          <span>
            {filteredCount} of {totalCount} tickets
          </span>
          {clearCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-[13px] font-semibold text-brand-primary hover:text-brand-primary-light transition-colors"
            >
              Clear filters ({clearCount})
            </button>
          )}
        </div>
      </div>

      {/* Load archived tickets */}
      {!archivedLoaded && (
        <div className="px-3 py-2 border-t border-border">
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
