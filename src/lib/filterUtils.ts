// Filter and sort utilities for ticket list

import { Ticket } from "@/types/ticket";
import { TicketFilters, SortOption, DateRange, DEFAULT_FILTERS } from "@/types/filters";

/**
 * Filter tickets based on all filter criteria
 */
export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  return tickets.filter((ticket) => {
    // Search filter (title, description, requester, assignee, ticket ID, location)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        ticket.title.toLowerCase().includes(searchLower) ||
        ticket.description.toLowerCase().includes(searchLower) ||
        ticket.requester.displayName.toLowerCase().includes(searchLower) ||
        (ticket.originalRequester?.toLowerCase().includes(searchLower) ?? false) ||
        // Search by ticket ID (with or without # prefix)
        ticket.id === searchLower.replace(/^#/, "") ||
        ticket.id.includes(searchLower.replace(/^#/, "")) ||
        // Search by assignee name
        (ticket.assignedTo?.displayName?.toLowerCase().includes(searchLower) ?? false) ||
        (ticket.originalAssignedTo?.toLowerCase().includes(searchLower) ?? false) ||
        // Search by location
        (ticket.location?.toLowerCase().includes(searchLower) ?? false);
      if (!matchesSearch) return false;
    }

    // Status filter (multi-select)
    if (filters.status.length > 0 && !filters.status.includes(ticket.status)) {
      return false;
    }

    // Priority filter (multi-select)
    if (filters.priority.length > 0 && !filters.priority.includes(ticket.priority)) {
      return false;
    }

    // Problem Type filter (cascading)
    if (filters.problemType && ticket.problemType !== filters.problemType) {
      return false;
    }
    if (filters.problemTypeSub && ticket.problemTypeSub !== filters.problemTypeSub) {
      return false;
    }
    if (filters.problemTypeSub2 && ticket.problemTypeSub2 !== filters.problemTypeSub2) {
      return false;
    }

    // Category filter
    if (filters.category && ticket.category !== filters.category) {
      return false;
    }

    // Assignee filter (check both assignedTo and originalAssignedTo)
    if (filters.assignee) {
      const assigneeEmail = ticket.originalAssignedTo?.toLowerCase() || ticket.assignedTo?.email?.toLowerCase() || "";
      if (assigneeEmail !== filters.assignee.toLowerCase()) {
        return false;
      }
    }

    // Location filter
    if (filters.location && ticket.location !== filters.location) {
      return false;
    }

    // Date range filter
    if (filters.dateRange !== "all" && !isDateInRange(ticket.created, filters.dateRange)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort tickets based on sort option
 */
export function sortTickets(tickets: Ticket[], sort: SortOption): Ticket[] {
  const sorted = [...tickets];
  const priorityOrder = { Urgent: 4, High: 3, Normal: 2, Low: 1 };

  switch (sort) {
    case "default":
      // Smart sort: Urgent always on top, then by date, then by priority for same date
      return sorted.sort((a, b) => {
        // Urgent tickets always come first
        const aIsUrgent = a.priority === "Urgent";
        const bIsUrgent = b.priority === "Urgent";
        if (aIsUrgent && !bIsUrgent) return -1;
        if (!aIsUrgent && bIsUrgent) return 1;

        // Both urgent or both not urgent - sort by date first
        const dateA = new Date(a.created).getTime();
        const dateB = new Date(b.created).getTime();

        // For same day, sort by priority
        const dayA = Math.floor(dateA / (1000 * 60 * 60 * 24));
        const dayB = Math.floor(dateB / (1000 * 60 * 60 * 24));

        if (dayA === dayB) {
          // Same day - sort by priority (higher priority first)
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
        }

        // Different days or same priority - sort by date (newest first)
        return dateB - dateA;
      });

    case "urgency":
      // Pure priority sort, then by date within each priority
      return sorted.sort((a, b) => {
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Same priority - sort by date (newest first)
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      });

    case "recent":
      return sorted.sort((a, b) =>
        new Date(b.created).getTime() - new Date(a.created).getTime()
      );

    case "oldest":
      return sorted.sort((a, b) =>
        new Date(a.created).getTime() - new Date(b.created).getTime()
      );

    default:
      return sorted;
  }
}

/**
 * Check if a date is within the specified range
 */
export function isDateInRange(dateString: string, range: DateRange): boolean {
  if (range === "all") return true;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (range) {
    case "today":
      return diffDays < 1;
    case "week":
      return diffDays < 7;
    case "month":
      return diffDays < 30;
    default:
      return true;
  }
}

/**
 * Count active filters (excluding search and sort)
 */
export function getActiveFilterCount(filters: TicketFilters): number {
  let count = 0;

  if (filters.status.length > 0) count++;
  if (filters.priority.length > 0) count++;
  if (filters.problemType) count++;
  if (filters.problemTypeSub) count++;
  if (filters.problemTypeSub2) count++;
  if (filters.category) count++;
  if (filters.assignee) count++;
  if (filters.location) count++;
  if (filters.dateRange !== "all") count++;

  return count;
}

/**
 * Check if any filters are active (including search)
 */
export function hasActiveFilters(filters: TicketFilters): boolean {
  return (
    filters.search !== "" ||
    getActiveFilterCount(filters) > 0
  );
}

/**
 * Reset filters to default values
 */
export function resetFilters(): TicketFilters {
  return { ...DEFAULT_FILTERS };
}
