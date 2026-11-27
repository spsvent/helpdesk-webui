import { describe, it, expect } from "vitest";
import type { UserPermissions } from "@/types/rbac";
import { DEFAULT_PERMISSIONS } from "@/types/rbac";
import type { FixLogEntry } from "./types";
import { mapToFixLogEntry, mapToFixLogIssue } from "./types";
import {
  filterEntries,
  fromLocalInputValue,
  imageFrameKind,
  isStillPhoto,
  stillDue,
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
    hasAttachments: false,
    attachmentsKnown: true,
    createdByEmail: "it@x.com",
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

  it("finds photos from SharePoint's Attachments flag even when PhotoCount is stale (0)", () => {
    const due = retentionDue(
      [entry({ id: "stale", photoCount: 0, hasAttachments: true, fixedAt: "2026-08-01T00:00:00Z" })],
      NOW
    );
    expect(due.photos.map((e) => e.id)).toEqual(["stale"]);
  });

  it("stillDue rechecks one fresh entry before a cleanup acts on it", () => {
    const old = entry({ hasAttachments: true, fixedAt: "2026-08-01T00:00:00Z" });
    expect(stillDue(old, "photos", NOW)).toBe(true);
    // Date corrected in another tab → no longer due.
    expect(stillDue({ ...old, fixedAt: "2026-11-20T00:00:00Z" }, "photos", NOW)).toBe(false);
    // Photos already removed → no longer due.
    expect(stillDue({ ...old, hasAttachments: false }, "photos", NOW)).toBe(false);
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

describe("isStillPhoto", () => {
  it("accepts still formats by MIME or extension (HEIC often has no MIME)", () => {
    expect(isStillPhoto("a.jpg", "image/jpeg")).toBe(true);
    expect(isStillPhoto("IMG_1.HEIC", "")).toBe(true);
    expect(isStillPhoto("a.png", "image/png")).toBe(true);
    expect(isStillPhoto("a.webp", "image/webp")).toBe(true);
  });
  it("rejects GIFs, video and non-images", () => {
    expect(isStillPhoto("a.gif", "image/gif")).toBe(false);
    expect(isStillPhoto("a.jpg", "image/gif")).toBe(false);
    expect(isStillPhoto("a.mov", "video/quicktime")).toBe(false);
    expect(isStillPhoto("a.pdf", "application/pdf")).toBe(false);
    expect(isStillPhoto("a.gif", "")).toBe(false);
  });
  it("trusts a stated type over the file name", () => {
    expect(isStillPhoto("clip.jpg", "video/mp4")).toBe(false);
  });
});

describe("imageFrameKind", () => {
  const bytes = (...parts: (number[] | string)[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
  const reader = (b: Uint8Array) => async (off: number, len: number) => b.slice(off, off + len);
  const kind = (b: Uint8Array) => imageFrameKind(reader(b), b.length);
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: number[] = []) => [...be32(data.length), ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  it("PNG: acTL before IDAT is animated; plain PNG is still", async () => {
    expect(await kind(bytes(PNG, chunk("IHDR", new Array(13).fill(0)), chunk("acTL", new Array(8).fill(0)), chunk("IDAT", [1])))).toBe("animated");
    expect(await kind(bytes(PNG, chunk("IHDR", new Array(13).fill(0)), chunk("IDAT", [1]), chunk("IEND")))).toBe("still");
  });
  it("PNG: walks real chunk boundaries — a huge metadata chunk before acTL is still found", async () => {
    const big = new Array(200000).fill(0x41);
    expect(await kind(bytes(PNG, chunk("IHDR", new Array(13).fill(0)), chunk("tEXt", big), chunk("acTL", new Array(8).fill(0)), chunk("IDAT", [1])))).toBe("animated");
  });
  it("PNG: the text 'acTL' inside a metadata chunk is NOT animation", async () => {
    expect(await kind(bytes(PNG, chunk("IHDR", new Array(13).fill(0)), chunk("tEXt", Array.from("Comment\0acTL", (c) => c.charCodeAt(0))), chunk("IDAT", [1])))).toBe("still");
  });
  it("PNG: truncated before IDAT is unknown", async () => {
    expect(await kind(bytes(PNG, chunk("IHDR", new Array(13).fill(0)), be32(500), "tEXt"))).toBe("unknown");
  });
  it("WebP: VP8/VP8L still, VP8X uses the animation flag", async () => {
    expect(await kind(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0]))).toBe("still");
    expect(await kind(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0]))).toBe("still");
    expect(await kind(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0x02]))).toBe("animated");
    expect(await kind(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0x10]))).toBe("still");
  });
  it("JPEG and HEIC are still; HEIF image sequences are animated", async () => {
    expect(await kind(bytes([0xff, 0xd8, 0xff, 0xe0], new Array(12).fill(0)))).toBe("still");
    expect(await kind(bytes([0, 0, 0, 24], "ftyp", "heic", new Array(8).fill(0)))).toBe("still");
    expect(await kind(bytes([0, 0, 0, 24], "ftyp", "msf1", new Array(8).fill(0)))).toBe("animated");
  });
  it("anything unrecognised or tiny is unknown", async () => {
    expect(await kind(bytes("GIF89a", new Array(10).fill(0)))).toBe("unknown");
    expect(await kind(new Uint8Array(4))).toBe("unknown");
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
      hasAttachments: false,
      createdByEmail: "creator@x.com",
      department: "Tech",
    });
    const withFlag = mapToFixLogEntry({ ...base, fields: { Title: "X", Attachments: true } });
    expect(withFlag.hasAttachments).toBe(true);
    expect(withFlag.attachmentsKnown).toBe(true);
    // No Attachments field at all → "unknown", which the cleanup refuses to trust.
    expect(e.attachmentsKnown).toBe(false);
  });
  it("reads the etag (annotation or eTag property) and survives a POST body without fields", () => {
    const item = { ...base, "@odata.etag": '"abc,1"' } as unknown as Parameters<typeof mapToFixLogEntry>[0];
    expect(mapToFixLogEntry(item).etag).toBe('"abc,1"');
    const item2 = { ...base, eTag: '"abc,2"' } as unknown as Parameters<typeof mapToFixLogEntry>[0];
    expect(mapToFixLogEntry(item2).etag).toBe('"abc,2"');
    expect(mapToFixLogEntry({ ...base, fields: {} }).etag).toBeUndefined();
    const bare = { id: "8", createdBy: { user: {} } } as unknown as Parameters<typeof mapToFixLogEntry>[0];
    expect(() => mapToFixLogEntry(bare)).not.toThrow();
    expect(() => mapToFixLogIssue(bare)).not.toThrow();
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
  it("lets the creator or an admin modify an entry", () => {
    const e = { createdByEmail: "IT@x.com", loggedByEmail: "IT@x.com" };
    expect(canModifyEntry(e, perms({ role: "support", email: "it@x.com" }))).toBe(true);
    expect(canModifyEntry(e, perms({ role: "support", email: "other@x.com" }))).toBe(false);
    expect(canModifyEntry(e, perms({ role: "admin", email: "gm@x.com" }))).toBe(true);
    expect(
      canModifyEntry({ createdByEmail: "", loggedByEmail: "" }, perms({ role: "support", email: "" }))
    ).toBe(false);
  });
  it("trusts the immutable creator over the editable LoggedByEmail text", () => {
    const forged = { createdByEmail: "real@x.com", loggedByEmail: "me@x.com" };
    expect(canModifyEntry(forged, perms({ role: "support", email: "me@x.com" }))).toBe(false);
    // Falls back to LoggedByEmail only when Graph omits the creator email.
    expect(
      canModifyEntry({ createdByEmail: "", loggedByEmail: "me@x.com" }, perms({ role: "support", email: "me@x.com" }))
    ).toBe(true);
  });
  it("limits cleanup to admins", () => {
    expect(canRunCleanup(perms({ role: "admin" }))).toBe(true);
    expect(canRunCleanup(perms({ role: "support", editableDepartments: ["Tech"] }))).toBe(false);
  });
});
