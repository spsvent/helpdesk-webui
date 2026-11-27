// Pure Quick Fix Log helpers (no Graph, no React) so they unit-test under node.

import type { FixLogEntry, FixLogIssue } from "./types";

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
// ISO-BMFF brands for image *sequences* (animated HEIF/AVIF).
const SEQUENCE_BRANDS = new Set(["msf1", "hevs", "hevm", "avis"]);

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
  // HEIC / HEIF (ISO-BMFF "ftyp" box)
  if (tag(head, 4) === "ftyp") return SEQUENCE_BRANDS.has(tag(head, 8)) ? "animated" : "still";
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
        ? [e.issue, e.location, e.device, e.notes, e.category]
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

// --- issues ------------------------------------------------------------------------

export function sortIssues(issues: FixLogIssue[]): FixLogIssue[] {
  return [...issues].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

// Next SortOrder for a newly added issue (end of the list, in steps of 10).
export function nextSortOrder(issues: FixLogIssue[]): number {
  return issues.reduce((max, i) => Math.max(max, i.sortOrder), 0) + 10;
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
  location: string;
  issue: string;
  fixedAtIso?: string;
  photoCount: number;
  photosConfirmed: boolean;
}

export function validateDraft(d: FixLogDraft, now: Date): string | null {
  if (!d.location) return "Pick a location.";
  if (!d.issue.trim()) return "Pick an issue, or choose Other and type one.";
  if (!d.fixedAtIso) return "Enter when the fix happened.";
  if (new Date(d.fixedAtIso).getTime() > now.getTime() + FUTURE_SKEW_MS)
    return "The fix time can't be in the future.";
  if (d.photoCount > 0 && !d.photosConfirmed)
    return "Tick the box confirming no people or personal details are in the photos.";
  return null;
}
