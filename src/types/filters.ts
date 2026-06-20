// Filter and sort types for ticket list

import { Ticket } from "./ticket";

export type SortOption = "default" | "urgency" | "recent" | "oldest";

export type DateRange = "today" | "week" | "month" | "all";

export type PresetView = "purchaseQueue" | "incomingOrders";

export interface TicketFilters {
  search: string;
  status: Ticket["status"][];
  priority: Ticket["priority"][];
  problemType: string | null;      // Level 1: Department
  problemTypeSub: string | null;   // Level 2: Sub-category
  problemTypeSub2: string | null;  // Level 3: Specific type
  category: Ticket["category"] | null;
  assignee: string | null;         // Filter by assignee email
  location: string | null;         // Filter by location
  dateRange: DateRange;
  sort: SortOption;
  // Viewer-relative quick filters (combinable; evaluated against the logged-in
  // user via the optional `viewer` argument to filterTickets)
  myDepartmentOnly: boolean;       // ticket.problemType is in viewer's editable departments
  assignedToMeOnly: boolean;       // ticket assignee email === viewer email
  requestedByMeOnly: boolean;      // ticket requester email === viewer email
  // Viewer-independent quick filter
  unassignedOnly: boolean;         // ticket has no assignee (triage)
  // Purchase request filters
  isPurchaseRequest?: boolean;
  purchaseStatus?: string[];
}

// Default view: active tickets only (Resolved AND Closed hidden), urgent on top,
// then by date. The "Show resolved & closed" toggle adds them back.
export const DEFAULT_FILTERS: TicketFilters = {
  search: "",
  status: ["New", "In Progress", "On Hold"], // Resolved & Closed hidden by default
  priority: [],
  problemType: null,
  problemTypeSub: null,
  problemTypeSub2: null,
  category: null,
  assignee: null,
  location: null,
  dateRange: "all",
  sort: "default",
  myDepartmentOnly: false,
  assignedToMeOnly: false,
  requestedByMeOnly: false,
  unassignedOnly: false,
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
  assignee: null,
  location: null,
  dateRange: "all",
  sort: "recent",
  myDepartmentOnly: false,
  assignedToMeOnly: false,
  requestedByMeOnly: false,
  unassignedOnly: false,
};

// Preset view configurations (role-gated quick views that reset the whole filter
// state). The former generic presets — Active / By Priority / All / Open — were
// removed in favour of the new default + the "Show resolved & closed" toggle +
// the combinable quick-filter chips.
export const PRESET_VIEWS: Record<PresetView, { label: string; description: string; filters: Partial<TicketFilters> }> = {
  purchaseQueue: {
    label: "Purchase Queue",
    description: "Approved purchases waiting to be ordered",
    filters: {
      status: [],
      sort: "recent",
      isPurchaseRequest: true,
      purchaseStatus: ["Approved", "Approved with Changes"],
    },
  },
  incomingOrders: {
    label: "Incoming Orders",
    description: "Purchased items waiting to be received",
    filters: {
      status: [],
      sort: "recent",
      isPurchaseRequest: true,
      purchaseStatus: ["Purchased", "Ordered"],
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
