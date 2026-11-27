import { describe, it, expect } from "vitest";
import type { UserPermissions } from "@/types/rbac";
import { DEFAULT_PERMISSIONS } from "@/types/rbac";
import type { FixLogEntry } from "./types";
import { mapToFixLogEntry, mapToFixLogIssue } from "./types";
import {
  filterEntries,
  fromLocalInputValue,
  nextSortOrder,
  pushRecentLocation,
  retentionDue,
  sortIssues,
  toLocalInputValue,
  topCounts,
  validateDraft,
} from "./fixLog";
import { canModifyEntry, canRunCleanup, canUseFixLog } from "./access";

const NOW = new Date("2026-11-27T20:00:00Z");

function entry(over: Partial<FixLogEntry> = {}): FixLogEntry {
  return {
    id: "1",
    issue: "POS frozen",
    location: "Admissions",
    fixedAt: "2026-11-27T19:00:00Z",
    loggedByName: "IT Person",
    loggedByEmail: "it@x.com",
    department: "Tech",
    photoCount: 0,
    created: "2026-11-27T19:00:00Z",
    modified: "2026-11-27T19:00:00Z",
    ...over,
  };
}

const perms = (over: Partial<UserPermissions>): UserPermissions => ({ ...DEFAULT_PERMISSIONS, ...over });

describe("retentionDue", () => {
  it("flags photos past 90 days, staff names past 12 months, entries past 3 years", () => {
    const all = [
      entry({ id: "fresh", photoCount: 2, stationStaffName: "Sam" }),
      entry({ id: "oldPhoto", photoCount: 1, fixedAt: "2026-08-01T00:00:00Z" }),
      entry({ id: "oldStaff", stationStaffName: "Sam", fixedAt: "2025-11-01T00:00:00Z" }),
      entry({ id: "ancient", photoCount: 1, stationStaffName: "Sam", fixedAt: "2023-11-01T00:00:00Z" }),
    ];
    const due = retentionDue(all, NOW);
    expect(due.photos.map((e) => e.id)).toEqual(["oldPhoto"]);
    expect(due.staff.map((e) => e.id)).toEqual(["oldStaff"]);
    // An entry due for deletion isn't double-counted in the photo/staff buckets.
    expect(due.entries.map((e) => e.id)).toEqual(["ancient"]);
  });

  it("ignores entries with no photos / no staff name", () => {
    const due = retentionDue([entry({ fixedAt: "2025-01-01T00:00:00Z" })], NOW);
    expect(due.photos).toHaveLength(0);
    expect(due.staff).toHaveLength(0);
  });

  it("counts a staff email on its own as staff data", () => {
    const due = retentionDue([entry({ stationStaffEmail: "s@x.com", fixedAt: "2025-01-01T00:00:00Z" })], NOW);
    expect(due.staff).toHaveLength(1);
  });
});

describe("filterEntries", () => {
  const all = [
    entry({ id: "a", location: "Admissions", issue: "POS frozen", notes: "rebooted", fixedAt: "2026-11-20T00:00:00Z" }),
    entry({ id: "b", location: "Pavilion", issue: "Wi-Fi down", device: "AP-3", fixedAt: "2026-11-26T00:00:00Z" }),
    entry({
      id: "c",
      location: "Admissions",
      issue: "Wi-Fi down",
      loggedByEmail: "Other@x.com",
      stationStaffName: "Jordan",
      fixedAt: "2026-10-01T00:00:00Z",
    }),
  ];

  it("filters by range, location, issue and logger, newest first", () => {
    expect(filterEntries(all, {}).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(filterEntries(all, { sinceIso: "2026-11-01T00:00:00Z" }).map((e) => e.id)).toEqual(["b", "a"]);
    expect(filterEntries(all, { location: "Admissions" }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(filterEntries(all, { issue: "Wi-Fi down" }).map((e) => e.id)).toEqual(["b", "c"]);
    expect(filterEntries(all, { mineEmail: "other@X.com" }).map((e) => e.id)).toEqual(["c"]);
  });

  it("searches notes and device", () => {
    expect(filterEntries(all, { search: "reboot" }).map((e) => e.id)).toEqual(["a"]);
    expect(filterEntries(all, { search: "ap-3" }).map((e) => e.id)).toEqual(["b"]);
  });

  it("never matches on the station-staff name (no per-person search)", () => {
    expect(filterEntries(all, { search: "Jordan" })).toHaveLength(0);
  });
});

describe("topCounts", () => {
  it("counts and ranks, ties alphabetical", () => {
    const rows = [
      entry({ location: "B" }),
      entry({ location: "A" }),
      entry({ location: "B" }),
      entry({ location: "C" }),
    ];
    expect(topCounts(rows, "location", 2)).toEqual([
      { label: "B", count: 2 },
      { label: "A", count: 1 },
    ]);
  });
});

describe("issues helpers", () => {
  const issues = [
    { id: "1", label: "Zeta", sortOrder: 20, active: true, department: "Tech" },
    { id: "2", label: "Alpha", sortOrder: 20, active: true, department: "Tech" },
    { id: "3", label: "First", sortOrder: 10, active: true, department: "Tech" },
  ];
  it("sorts by SortOrder then label", () => {
    expect(sortIssues(issues).map((i) => i.id)).toEqual(["3", "2", "1"]);
  });
  it("appends after the highest SortOrder", () => {
    expect(nextSortOrder(issues)).toBe(30);
    expect(nextSortOrder([])).toBe(10);
  });
});

describe("pushRecentLocation", () => {
  it("moves to front, dedupes, caps", () => {
    expect(pushRecentLocation(["A", "B", "C"], "B", 3)).toEqual(["B", "A", "C"]);
    expect(pushRecentLocation(["A", "B", "C"], "D", 3)).toEqual(["D", "A", "B"]);
    expect(pushRecentLocation(["A"], "")).toEqual(["A"]);
  });
});

describe("datetime-local round trip", () => {
  it("formats and parses in the local zone", () => {
    const d = new Date(2026, 10, 27, 9, 5);
    expect(toLocalInputValue(d)).toBe("2026-11-27T09:05");
    expect(fromLocalInputValue("2026-11-27T09:05")).toBe(d.toISOString());
    expect(fromLocalInputValue("")).toBeUndefined();
    expect(fromLocalInputValue("nonsense")).toBeUndefined();
  });
});

describe("validateDraft", () => {
  const ok = {
    location: "Admissions",
    issue: "POS frozen",
    fixedAtIso: NOW.toISOString(),
    photoCount: 0,
    photosConfirmed: false,
  };
  it("accepts a complete draft", () => {
    expect(validateDraft(ok, NOW)).toBeNull();
  });
  it("requires location, issue and time", () => {
    expect(validateDraft({ ...ok, location: "" }, NOW)).toMatch(/location/i);
    expect(validateDraft({ ...ok, issue: "  " }, NOW)).toMatch(/issue/i);
    expect(validateDraft({ ...ok, fixedAtIso: undefined }, NOW)).toMatch(/when/i);
  });
  it("rejects future times beyond the skew allowance", () => {
    expect(validateDraft({ ...ok, fixedAtIso: "2026-11-27T20:04:00Z" }, NOW)).toBeNull();
    expect(validateDraft({ ...ok, fixedAtIso: "2026-11-27T21:00:00Z" }, NOW)).toMatch(/future/i);
  });
  it("requires the no-people tick box when photos are attached", () => {
    expect(validateDraft({ ...ok, photoCount: 1 }, NOW)).toMatch(/tick/i);
    expect(validateDraft({ ...ok, photoCount: 1, photosConfirmed: true }, NOW)).toBeNull();
  });
});

describe("mappers", () => {
  const base = {
    id: "7",
    createdDateTime: "2026-11-27T19:00:00Z",
    lastModifiedDateTime: "2026-11-27T19:00:00Z",
    createdBy: { user: { id: "u", displayName: "Creator", email: "creator@x.com" } },
  };
  it("maps an entry, falling back to createdBy and created time", () => {
    const e = mapToFixLogEntry({ ...base, fields: { Title: "POS frozen", Location: "Admissions", Device: "" } });
    expect(e).toMatchObject({
      id: "7",
      issue: "POS frozen",
      location: "Admissions",
      device: undefined,
      fixedAt: "2026-11-27T19:00:00Z",
      loggedByName: "Creator",
      loggedByEmail: "creator@x.com",
      photoCount: 0,
      department: "Tech",
    });
  });
  it("treats a missing Active as active", () => {
    expect(mapToFixLogIssue({ ...base, fields: { Title: "X" } }).active).toBe(true);
    expect(mapToFixLogIssue({ ...base, fields: { Title: "X", Active: false } }).active).toBe(false);
  });
});

describe("access", () => {
  it("is IT + admins only", () => {
    expect(canUseFixLog(null)).toBe(false);
    expect(canUseFixLog(perms({ role: "admin" }))).toBe(true);
    expect(canUseFixLog(perms({ role: "support", editableDepartments: ["Tech"] }))).toBe(true);
    expect(canUseFixLog(perms({ role: "support", editableDepartments: ["Facilities"] }))).toBe(false);
    expect(canUseFixLog(perms({ role: "user" }))).toBe(false);
  });
  it("lets the logger or an admin modify an entry", () => {
    const e = { loggedByEmail: "IT@x.com" };
    expect(canModifyEntry(e, perms({ role: "support", email: "it@x.com" }))).toBe(true);
    expect(canModifyEntry(e, perms({ role: "support", email: "other@x.com" }))).toBe(false);
    expect(canModifyEntry(e, perms({ role: "admin", email: "gm@x.com" }))).toBe(true);
    expect(canModifyEntry({ loggedByEmail: "" }, perms({ role: "support", email: "" }))).toBe(false);
  });
  it("limits cleanup to admins", () => {
    expect(canRunCleanup(perms({ role: "admin" }))).toBe(true);
    expect(canRunCleanup(perms({ role: "support", editableDepartments: ["Tech"] }))).toBe(false);
  });
});
