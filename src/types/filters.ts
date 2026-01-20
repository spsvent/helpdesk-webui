// Filter and sort types for ticket list

import { Ticket } from "./ticket";

export type SortOption = "default" | "urgency" | "recent" | "oldest";

export type DateRange = "today" | "week" | "month" | "all";

export type PresetView = "default" | "urgency" | "all" | "open";

export interface TicketFilters {
  search: string;
  status: Ticket["status"][];
  priority: Ticket["priority"][];
  problemType: string | null;      // Level 1: Department
  problemTypeSub: string | null;   // Level 2: Sub-category
  problemTypeSub2: string | null;  // Level 3: Specific type
  category: Ticket["category"] | null;
  dateRange: DateRange;
  sort: SortOption;
}

// Default view: Hide resolved/closed, urgent on top, then by date
export const DEFAULT_FILTERS: TicketFilters = {
  search: "",
  status: ["New", "In Progress", "On Hold"], // Hide Resolved and Closed by default
  priority: [],
  problemType: null,
  problemTypeSub: null,
  problemTypeSub2: null,
  category: null,
  dateRange: "all",
  sort: "default",
};

// Empty filters - show everything
export const EMPTY_FILTERS: TicketFilters = {
  search: "",
  status: [],
  priority: [],
  problemType: null,
  problemTypeSub: null,
  problemTypeSub2: null,
  category: null,
  dateRange: "all",
  sort: "recent",
};

// Preset view configurations
export const PRESET_VIEWS: Record<PresetView, { label: string; description: string; filters: Partial<TicketFilters> }> = {
  default: {
    label: "Active Tickets",
    description: "Urgent on top, then by date",
    filters: {
      status: ["New", "In Progress", "On Hold"],
      sort: "default",
    },
  },
  urgency: {
    label: "By Priority",
    description: "Sorted by urgency, then date",
    filters: {
      status: ["New", "In Progress", "On Hold"],
      sort: "urgency",
    },
  },
  all: {
    label: "All Tickets",
    description: "Everything, newest first",
    filters: {
      status: [],
      sort: "recent",
    },
  },
  open: {
    label: "Open Only",
    description: "New & In Progress only",
    filters: {
      status: ["New", "In Progress"],
      sort: "default",
    },
  },
};

// Status options for filter chips
export const STATUS_OPTIONS: Ticket["status"][] = [
  "New",
  "In Progress",
  "On Hold",
  "Resolved",
  "Closed",
];

// Priority options for filter chips
export const PRIORITY_OPTIONS: Ticket["priority"][] = [
  "Urgent",
  "High",
  "Normal",
  "Low",
];

// Date range options
export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

// Sort options
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "default", label: "Smart (urgent on top)" },
  { value: "urgency", label: "By priority" },
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];
