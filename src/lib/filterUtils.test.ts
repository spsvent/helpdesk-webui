import { describe, it, expect } from "vitest";
import {
  clearApprovalFilter,
  filterTickets,
  filtersMatchDefault,
  getActiveFilterCount,
  getActiveFilterSummary,
  isShowingResolvedClosed,
  isStatusFilterActive,
  toggleResolvedClosedStatuses,
} from "./filterUtils";
import { DEFAULT_FILTERS, EMPTY_FILTERS, TicketFilters } from "@/types/filters";
import { Ticket } from "@/types/ticket";

// Minimal Ticket factory — only the fields the filter logic reads need realistic values.
function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "1",
    title: "Test ticket",
    description: "desc",
    category: "Problem",
    priority: "Normal",
    status: "New",
    problemType: "Tech",
    requester: { displayName: "Req User", email: "req@x.com" },
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    createdBy: { displayName: "Creator", email: "creator@x.com" },
    approvalStatus: "None",
    ...overrides,
  };
}

// A filter object that applies no constraints, so each test isolates one predicate.
const NO_FILTERS: TicketFilters = {
  ...DEFAULT_FILTERS,
  status: [],
  priority: [],
  myDepartmentOnly: false,
  assignedToMeOnly: false,
  requestedByMeOnly: false,
  unassignedOnly: false,
};

const viewer = { email: "me@x.com", editableDepartments: ["Tech", "Operations"] };

describe("filterTickets — assignedToMeOnly", () => {
  it("keeps tickets whose Person-field assignee is the viewer (case-insensitive)", () => {
    const mine = makeTicket({ id: "a", assignedTo: { displayName: "Me", email: "ME@x.com" } });
    const theirs = makeTicket({ id: "b", assignedTo: { displayName: "Them", email: "you@x.com" } });
    const result = filterTickets([mine, theirs], { ...NO_FILTERS, assignedToMeOnly: true }, viewer);
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });

  it("matches the legacy originalAssignedTo email too", () => {
    const mine = makeTicket({ id: "a", originalAssignedTo: "me@x.com" });
    const theirs = makeTicket({ id: "b", originalAssignedTo: "other@x.com" });
    const result = filterTickets([mine, theirs], { ...NO_FILTERS, assignedToMeOnly: true }, viewer);
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });

  it("is ignored when no viewer is supplied", () => {
    const a = makeTicket({ id: "a", assignedTo: { displayName: "X", email: "x@x.com" } });
    const result = filterTickets([a], { ...NO_FILTERS, assignedToMeOnly: true });
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("filterTickets — myDepartmentOnly", () => {
  it("keeps tickets whose problemType is in the viewer's editable departments", () => {
    const tech = makeTicket({ id: "a", problemType: "Tech" });
    const ops = makeTicket({ id: "b", problemType: "Operations" });
    const hr = makeTicket({ id: "c", problemType: "HR" });
    const result = filterTickets([tech, ops, hr], { ...NO_FILTERS, myDepartmentOnly: true }, viewer);
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("filterTickets — requestedByMeOnly", () => {
  it("keeps tickets the viewer requested (Person field, case-insensitive)", () => {
    const mine = makeTicket({ id: "a", requester: { displayName: "Me", email: "Me@x.com" } });
    const theirs = makeTicket({ id: "b", requester: { displayName: "Them", email: "them@x.com" } });
    const result = filterTickets([mine, theirs], { ...NO_FILTERS, requestedByMeOnly: true }, viewer);
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });

  it("matches the legacy originalRequester email too", () => {
    const mine = makeTicket({
      id: "a",
      requester: { displayName: "Other", email: "other@x.com" },
      originalRequester: "me@x.com",
    });
    const result = filterTickets([mine], { ...NO_FILTERS, requestedByMeOnly: true }, viewer);
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("filterTickets — unassignedOnly", () => {
  it("keeps only tickets with no assignee (works without a viewer)", () => {
    const unassigned = makeTicket({ id: "a" });
    const personAssigned = makeTicket({ id: "b", assignedTo: { displayName: "X", email: "x@x.com" } });
    const legacyAssigned = makeTicket({ id: "c", originalAssignedTo: "y@x.com" });
    const result = filterTickets(
      [unassigned, personAssigned, legacyAssigned],
      { ...NO_FILTERS, unassignedOnly: true }
    );
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("filterTickets — quick chips combine (AND)", () => {
  it("requires BOTH my-department and assigned-to-me when both are on", () => {
    const deptAndMine = makeTicket({ id: "a", problemType: "Tech", originalAssignedTo: "me@x.com" });
    const deptNotMine = makeTicket({ id: "b", problemType: "Tech", originalAssignedTo: "you@x.com" });
    const mineWrongDept = makeTicket({ id: "c", problemType: "HR", originalAssignedTo: "me@x.com" });
    const result = filterTickets(
      [deptAndMine, deptNotMine, mineWrongDept],
      { ...NO_FILTERS, myDepartmentOnly: true, assignedToMeOnly: true },
      viewer
    );
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("show resolved & closed — checkbox state", () => {
  it("is checked for an empty status set (show-all includes resolved & closed)", () => {
    expect(isShowingResolvedClosed([])).toBe(true);
  });

  it("is unchecked for the default active-status set", () => {
    expect(isShowingResolvedClosed(DEFAULT_FILTERS.status)).toBe(false);
  });

  it("is checked when Resolved or Closed is explicitly selected", () => {
    expect(isShowingResolvedClosed(["Resolved"])).toBe(true);
    expect(isShowingResolvedClosed(["New", "Closed"])).toBe(true);
  });
});

describe("show resolved & closed — the four toggle transitions", () => {
  it("unchecking from the empty set falls back to the default active statuses", () => {
    expect(toggleResolvedClosedStatuses([])).toEqual(DEFAULT_FILTERS.status);
  });

  it("checking from the default set adds Resolved and Closed (preserving the rest)", () => {
    const next = toggleResolvedClosedStatuses(DEFAULT_FILTERS.status);
    expect(next).toEqual(
      expect.arrayContaining([...DEFAULT_FILTERS.status, "Resolved", "Closed"])
    );
    expect(next).toHaveLength(5);
    expect(isShowingResolvedClosed(next)).toBe(true);
  });

  it("unchecking from an explicit selection drops only Resolved and Closed", () => {
    expect(toggleResolvedClosedStatuses(["New", "Resolved", "Closed"])).toEqual(["New"]);
  });

  it("unchecking when ONLY Resolved/Closed are selected falls back to the defaults", () => {
    expect(toggleResolvedClosedStatuses(["Resolved", "Closed"])).toEqual(DEFAULT_FILTERS.status);
  });

  it("checking from a partial active selection preserves it", () => {
    const next = toggleResolvedClosedStatuses(["New"]);
    expect(next).toEqual(expect.arrayContaining(["New", "Resolved", "Closed"]));
    expect(next).toHaveLength(3);
  });

  it("every transition lands in a state where the checkbox reads truthfully", () => {
    // From each of the four canonical states, toggling flips the checkbox.
    const states: Ticket["status"][][] = [
      [],
      DEFAULT_FILTERS.status,
      ["Resolved", "Closed"],
      ["New", "In Progress", "On Hold", "Resolved", "Closed"],
    ];
    for (const status of states) {
      const before = isShowingResolvedClosed(status);
      const after = isShowingResolvedClosed(toggleResolvedClosedStatuses(status));
      expect(after).toBe(!before);
    }
  });
});

describe("getActiveFilterCount / summary — default status is not an active filter", () => {
  it("counts zero active filters for the out-of-the-box default view", () => {
    expect(getActiveFilterCount({ ...DEFAULT_FILTERS })).toBe(0);
  });

  it("counts zero for the empty (show-all) view", () => {
    expect(getActiveFilterCount({ ...EMPTY_FILTERS })).toBe(0);
  });

  it("ignores status order when comparing against the default set", () => {
    const reordered: TicketFilters = {
      ...DEFAULT_FILTERS,
      status: ["On Hold", "New", "In Progress"],
    };
    expect(getActiveFilterCount(reordered)).toBe(0);
    expect(getActiveFilterSummary(reordered)).toEqual([]);
  });

  it("still counts a genuinely narrowed status set", () => {
    expect(isStatusFilterActive(["New"])).toBe(true);
    expect(getActiveFilterCount({ ...DEFAULT_FILTERS, status: ["New"] })).toBe(1);
  });

  it("renders no Status pill for the default view but does for a narrowed one", () => {
    expect(getActiveFilterSummary({ ...DEFAULT_FILTERS })).toEqual([]);
    expect(getActiveFilterSummary({ ...DEFAULT_FILTERS, status: ["Resolved"] })).toEqual([
      "Status: Resolved",
    ]);
  });

  it("still counts the other filters unchanged", () => {
    expect(getActiveFilterCount({ ...DEFAULT_FILTERS, priority: ["Urgent"] })).toBe(1);
    expect(
      getActiveFilterCount({ ...DEFAULT_FILTERS, problemType: "Tech", dateRange: "week" })
    ).toBe(2);
  });
});

describe("filtersMatchDefault", () => {
  it("is true for the unmodified default filters", () => {
    expect(filtersMatchDefault({ ...DEFAULT_FILTERS })).toBe(true);
  });

  it("is false once a quick chip boolean is toggled on", () => {
    expect(filtersMatchDefault({ ...DEFAULT_FILTERS, assignedToMeOnly: true })).toBe(false);
    expect(filtersMatchDefault({ ...DEFAULT_FILTERS, myDepartmentOnly: true })).toBe(false);
    expect(filtersMatchDefault({ ...DEFAULT_FILTERS, requestedByMeOnly: true })).toBe(false);
    expect(filtersMatchDefault({ ...DEFAULT_FILTERS, unassignedOnly: true })).toBe(false);
  });
});

describe("clearApprovalFilter — clearing the Awaiting Approval chip", () => {
  // What the pendingApprovals preset actually produces in page.tsx.
  const presetState: TicketFilters = {
    ...EMPTY_FILTERS,
    status: [],
    sort: "recent",
    approvalStatus: ["Pending", "Changes Requested"],
  };

  it("drops approvalStatus and restores the default status/sort from the preset residue", () => {
    const next = clearApprovalFilter(presetState);
    expect(next.approvalStatus).toBeUndefined();
    expect(next.status).toEqual(DEFAULT_FILTERS.status);
    expect(next.sort).toBe(DEFAULT_FILTERS.sort);
  });

  it("preserves the current search text", () => {
    const next = clearApprovalFilter({ ...presetState, search: "printer" });
    expect(next.search).toBe("printer");
    expect(next.approvalStatus).toBeUndefined();
  });

  it("keeps statuses the user hand-picked after applying the preset", () => {
    const next = clearApprovalFilter({ ...presetState, status: ["On Hold"] });
    expect(next.status).toEqual(["On Hold"]);
    expect(next.approvalStatus).toBeUndefined();
  });

  it("does not mutate the input filters", () => {
    const input = { ...presetState };
    clearApprovalFilter(input);
    expect(input.approvalStatus).toEqual(["Pending", "Changes Requested"]);
    expect(input.status).toEqual([]);
  });
});
