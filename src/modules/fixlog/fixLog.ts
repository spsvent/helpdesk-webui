// Pure Quick Fix Log helpers (no Graph, no React) so they unit-test under node.

import type { FixLogEntry, FixLogIssue } from "./types";
import { LOCATION_OPTIONS } from "@/lib/locationConfig";

// --- retention ----------------------------------------------------------------
// Periods from the attorney check (2026-11-27). Cleanup is MANUAL by Justin's
// choice: an admin runs it from the Fix Log page; there is no scheduled job.
export const RETENTION = {
  photoDays: 90,
  stationStaffMonths: 12,
  entryYears: 3,
} as const;

export function retentionCutoffs(now: Date) {
  const photos = new Date(now);
  photos.setDate(photos.getDate() - RETENTION.photoDays);
  const staff = new Date(now);
  staff.setMonth(staff.getMonth() - RETENTION.stationStaffMonths);
  const entries = new Date(now);
  entries.setFullYear(entries.getFullYear() - RETENTION.entryYears);
  return { photos, staff, entries };
}

export interface RetentionDue {
  photos: FixLogEntry[]; // entries whose photos should be deleted
  staff: FixLogEntry[]; // entries whose station-staff name/email should be cleared
  entries: FixLogEntry[]; // entries that should be deleted outright
}

// The clock runs from fixedAt (when the fix happened). fixedAt is never later than
// the save time, so this is the earlier — more conservative — of the two dates.
export function retentionDue(all: FixLogEntry[], now: Date): RetentionDue {
  const c = retentionCutoffs(now);
  const older = (e: FixLogEntry, cutoff: Date) => new Date(e.fixedAt).getTime() < cutoff.getTime();
  const entries = all.filter((e) => older(e, c.entries));
  const deleting = new Set(entries.map((e) => e.id));
  return {
    entries,
    // Rows about to be deleted outright aren't double-counted in the other buckets.
    // hasAttachments is SharePoint's own flag; PhotoCount is only a cache.
    photos: all.filter(
      (e) => !deleting.has(e.id) && (e.hasAttachments || e.photoCount > 0) && older(e, c.photos)
    ),
    staff: all.filter(
      (e) =>
        !deleting.has(e.id) && !!(e.stationStaffName || e.stationStaffEmail) && older(e, c.staff)
    ),
  };
}

// Re-check one freshly read entry right before a cleanup action touches it, so a
// stale scan (date corrected in another tab, photos already removed) is skipped.
export function stillDue(entry: FixLogEntry, job: keyof RetentionDue, now: Date): boolean {
  return retentionDue([entry], now)[job].length === 1;
}

// --- photos -----------------------------------------------------------------------

// Still photos only: no GIFs, no video, no animated PNG/WebP.
const STILL_EXT = /\.(jpe?g|png|hei[cf]|webp)$/i;
const STILL_MIME = /^image\/(jpeg|png|heic|heif|webp)$/i;

// By type: a stated MIME type must itself be a still format (a "video/…" file
// named .jpg is refused). The extension is only consulted when the browser gave
// no type at all, which is common for HEIC.
export function isStillPhoto(name: string, type: string): boolean {
  if (type) return STILL_MIME.test(type);
  return STILL_EXT.test(name);
}

// --- still vs animated, from the file's own structure ---------------------------

export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;
export type FrameKind = "still" | "animated" | "unknown";

const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const MAX_PNG_CHUNKS = 100000;
// ISO-BMFF ("ftyp") brands. A file counts as a still HEIC/HEIF only when its major
// brand is a known still-image brand AND no brand anywhere in the box is a
// sequence/video one. Everything else (MP4, MOV, HEIF sequences…) is rejected.
const STILL_HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "mif1", "mif2"]);
const MOVING_BRANDS = new Set([
  "msf1", "hevc", "hevx", "hevm", "hevs", "avis", // image sequences
  "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "qt  ", "M4V ", "3gp4", "3gp5", "3g2a", "dash", "MSNV", // video
]);
const MAX_FTYP = 4096;

/**
 * Walks the real container structure (only small header reads, any file size):
 * - PNG: chunk by chunk — "acTL" before the first "IDAT" = animated (APNG).
 * - WebP: first chunk VP8 / VP8L = still; VP8X = check its animation flag.
 * - JPEG = still. HEIC/HEIF = still unless the brand is an image sequence.
 * Anything else, truncated or unparseable = "unknown" (callers reject it).
 */
export async function imageFrameKind(read: ByteReader, size: number): Promise<FrameKind> {
  const head = await read(0, 16);
  if (head.length < 12) return "unknown";
  // PNG
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((v, i) => head[i] === v)) {
    let off = 8;
    for (let n = 0; n < MAX_PNG_CHUNKS && off + 8 <= size; n++) {
      const h = await read(off, 8);
      if (h.length < 8) return "unknown";
      const len = h[0] * 0x1000000 + (h[1] << 16) + (h[2] << 8) + h[3];
      const type = tag(h, 4);
      if (type === "acTL") return "animated";
      if (type === "IDAT" || type === "IEND") return "still";
      off += 12 + len; // length + type + data + CRC
    }
    return "unknown";
  }
  // WebP: "RIFF" <size> "WEBP" <first chunk fourcc> <size> <payload…>
  if (tag(head, 0) === "RIFF" && tag(head, 8) === "WEBP") {
    const c = await read(12, 9);
    if (c.length < 9) return "unknown";
    const fourcc = tag(c, 0);
    if (fourcc === "VP8 " || fourcc === "VP8L") return "still";
    if (fourcc === "VP8X") return c[8] & 0x02 ? "animated" : "still"; // flags byte, A bit
    return "unknown";
  }
  // JPEG
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "still";
  // HEIC / HEIF (ISO-BMFF "ftyp" box: size, "ftyp", major brand, minor version,
  // then compatible brands to the end of the box)
  if (tag(head, 4) === "ftyp") {
    const boxSize = head[0] * 0x1000000 + (head[1] << 16) + (head[2] << 8) + head[3];
    // Brands are 4 bytes each after the 16-byte header; a partial one = damaged box.
    if (boxSize < 16 || boxSize > MAX_FTYP || boxSize > size || (boxSize - 16) % 4 !== 0) return "unknown";
    const box = await read(0, boxSize);
    if (box.length < boxSize) return "unknown";
    const brands = [tag(box, 8)];
    for (let at = 16; at + 4 <= boxSize; at += 4) brands.push(tag(box, at));
    if (brands.some((b) => MOVING_BRANDS.has(b))) return "animated";
    return STILL_HEIF_BRANDS.has(brands[0]) ? "still" : "unknown";
  }
  return "unknown";
}

// --- list filtering + summary ---------------------------------------------------

export const RANGE_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
  { days: 0, label: "All time" },
] as const;

export function rangeStartIso(days: number, now: Date): string | undefined {
  if (!days) return undefined;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export interface FixLogFilter {
  sinceIso?: string;
  location?: string;
  issue?: string;
  mineEmail?: string; // only entries logged by this address
  search?: string;
}

// Free-text search deliberately skips the station-staff fields: per the attorney
// check the log must offer no per-person count, sort, filter or search of the
// staff member who was at the station (that would make it a personnel record).
export function filterEntries(entries: FixLogEntry[], f: FixLogFilter): FixLogEntry[] {
  const since = f.sinceIso ? new Date(f.sinceIso).getTime() : undefined;
  const q = f.search?.trim().toLowerCase();
  const mine = f.mineEmail?.toLowerCase();
  return entries
    .filter((e) => (since === undefined ? true : new Date(e.fixedAt).getTime() >= since))
    .filter((e) => (f.location ? e.location === f.location : true))
    .filter((e) => (f.issue ? e.issue === f.issue : true))
    .filter((e) => (mine ? e.loggedByEmail.toLowerCase() === mine : true))
    .filter((e) =>
      q
        ? [e.issue, e.location, e.device, e.resolution, e.notes, e.category]
            .filter(Boolean)
            .some((s) => (s as string).toLowerCase().includes(q))
        : true
    )
    .sort(byFixedAtDesc);
}

export function byFixedAtDesc(a: FixLogEntry, b: FixLogEntry): number {
  return new Date(b.fixedAt).getTime() - new Date(a.fixedAt).getTime();
}

export function topCounts(
  entries: FixLogEntry[],
  key: "location" | "issue" | "category",
  n = 5
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = e[key];
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}

// --- issue tree ------------------------------------------------------------------
// QuickFixIssues rows form a tree via parentId ("" = top level). A node with
// children is a folder; one without is a pickable issue. Orphans (parent deleted
// or missing) are treated as top level so nothing silently disappears.

export const PATH_SEPARATOR = " › ";

export function sortIssues(issues: FixLogIssue[]): FixLogIssue[] {
  return [...issues].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** The folder a node is shown in: its parent, or "" (top) if that parent is gone. */
export function effectiveParent(issues: FixLogIssue[], node: FixLogIssue): string {
  return node.parentId && issues.some((i) => i.id === node.parentId) ? node.parentId : "";
}

/**
 * Nodes that can't be reached from the top because their parent chain loops
 * (e.g. two people moved A into B and B into A at the same moment). The editor
 * lists them under "Needs attention" so they can be put back; the form hides them.
 */
export function unreachableNodes(issues: FixLogIssue[]): FixLogIssue[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  return sortIssues(
    issues.filter((n) => {
      const seen = new Set<string>();
      let cur: FixLogIssue | undefined = n;
      while (cur) {
        if (seen.has(cur.id)) return true;
        seen.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return false;
    })
  );
}

/** Direct children of a folder ("" = top level), sorted. */
export function childrenOf(issues: FixLogIssue[], parentId: string): FixLogIssue[] {
  return sortIssues(issues.filter((i) => effectiveParent(issues, i) === parentId));
}

export function hasChildren(issues: FixLogIssue[], id: string): boolean {
  return issues.some((i) => effectiveParent(issues, i) === id);
}

/** Root → node chain (inclusive). Stops on a cycle instead of looping forever. */
export function pathTo(issues: FixLogIssue[], id: string): FixLogIssue[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const chain: FixLogIssue[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function pathLabel(nodes: { label: string }[], extra?: string): string {
  return [...nodes.map((n) => n.label), ...(extra ? [extra] : [])].join(PATH_SEPARATOR);
}

/** Every node under `id` (not including it). */
export function descendantIds(issues: FixLogIssue[], id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  const seen = new Set<string>([id]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const c of issues.filter((i) => i.parentId === cur)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      queue.push(c.id);
    }
  }
  return out;
}

/**
 * The form's view of the tree: only active nodes whose whole ancestor chain is
 * active (retiring a folder hides everything inside it).
 */
export function visibleIssues(issues: FixLogIssue[]): FixLogIssue[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const ok = (n: FixLogIssue): boolean => {
    const seen = new Set<string>();
    let cur: FixLogIssue | undefined = n;
    while (cur) {
      if (!cur.active || seen.has(cur.id)) return false;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return true;
  };
  return issues.filter(ok);
}

/**
 * What gets stored for a pick: the full path label, the node id, and the
 * top-level folder as the category. `otherText` = a typed issue inside `folderId`.
 */
export function describePick(
  issues: FixLogIssue[],
  pick: { nodeId?: string; folderId?: string; otherText?: string }
): { issue: string; issueId: string; category: string } {
  if (pick.nodeId) {
    const path = pathTo(issues, pick.nodeId);
    return { issue: pathLabel(path), issueId: pick.nodeId, category: path.length > 1 ? path[0].label : "" };
  }
  const folder = pick.folderId ? pathTo(issues, pick.folderId) : [];
  const text = (pick.otherText || "").trim();
  return { issue: text ? pathLabel(folder, text) : "", issueId: "", category: folder[0]?.label || "" };
}

/** Folders a node may be moved into: anything except itself and its descendants. */
export function moveTargets(issues: FixLogIssue[], id: string): FixLogIssue[] {
  const banned = new Set([id, ...descendantIds(issues, id)]);
  return sortIssues(issues.filter((i) => !banned.has(i.id)));
}

// Next SortOrder at the end of a folder, in steps of 10.
export function nextSortOrder(siblings: FixLogIssue[]): number {
  return siblings.reduce((max, i) => Math.max(max, i.sortOrder), 0) + 10;
}

// --- locations ---------------------------------------------------------------------

// Choosing this in the Fix Log means "not in the list — I'll type it".
export const OTHER_LOCATION = "Other";

const OFFICIAL_LOCATIONS: readonly string[] = LOCATION_OPTIONS.filter((l) => l !== OTHER_LOCATION);

export function isOfficialLocation(name: string): boolean {
  return OFFICIAL_LOCATIONS.includes(name);
}

/** Tidy a typed location (trim, collapse spaces) and snap it to an official name
 *  if it only differs by case/spacing, so "pavilion " doesn't raise a ticket. */
export function resolveTypedLocation(typed: string): { name: string; official: boolean } {
  const name = typed.trim().replace(/\s+/g, " ");
  const hit = OFFICIAL_LOCATIONS.find((l) => l.toLowerCase() === name.toLowerCase());
  return hit ? { name: hit, official: true } : { name, official: false };
}

export const LOCATION_TICKET_PREFIX = "Add location: ";

export function locationTicketTitle(name: string): string {
  return `${LOCATION_TICKET_PREFIX}${name}`;
}

// --- recent locations (persisted per browser by the form) --------------------------

export const RECENT_LOCATIONS_MAX = 6;

export function pushRecentLocation(recent: string[], location: string, max = RECENT_LOCATIONS_MAX): string[] {
  if (!location) return recent;
  return [location, ...recent.filter((l) => l !== location)].slice(0, max);
}

// --- date/time input -------------------------------------------------------------

// <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") in the browser's local zone.
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Parse a datetime-local value (local zone) to ISO; undefined when blank/invalid.
export function fromLocalInputValue(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Small allowance for clock skew between the phone and SharePoint.
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// --- validation ------------------------------------------------------------------

export interface FixLogDraft {
  location: string; // final location string ("" when "Other" is picked but nothing typed)
  issue: string;
  fixedAtIso?: string;
  photoCount: number;
  photosConfirmed: boolean;
}

export function validateDraft(d: FixLogDraft, now: Date): string | null {
  if (!d.location.trim()) return "Pick a location, or choose Other and type it.";
  if (!d.issue.trim()) return "Pick an issue, or choose Other and type one.";
  if (!d.fixedAtIso) return "Enter when the fix happened.";
  if (new Date(d.fixedAtIso).getTime() > now.getTime() + FUTURE_SKEW_MS)
    return "The fix time can't be in the future.";
  if (d.photoCount > 0 && !d.photosConfirmed)
    return "Tick the box confirming no people or personal details are in the photos.";
  return null;
}
