import { describe, it, expect } from "vitest";
import { filterTickets, filtersMatchDefault } from "./filterUtils";
import { DEFAULT_FILTERS, TicketFilters } from "@/types/filters";
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
