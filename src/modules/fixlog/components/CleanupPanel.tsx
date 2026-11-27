"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { RETENTION, retentionDue, stillDue, type RetentionDue } from "../fixLog";
import {
  EntryChangedError,
  deleteAllEntryPhotos,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from "../fixLogService";

type Job = "photos" | "staff" | "entries";

// Admin-only, run by hand (Justin chose manual cleanup over a scheduled job).
// Applies the attorney's retention periods to the whole log.
export default function CleanupPanel({ onDone }: { onDone: () => void }) {
  const { instance, accounts } = useMsal();
  const [due, setDue] = useState<RetentionDue | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState<Job | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // keepMessage: re-scan after a run without wiping that run's summary.
  async function check(keepMessage = false) {
    if (!accounts[0]) return;
    setChecking(true);
    if (!keepMessage) setMessage(null);
    try {
      const all = await listEntries(getGraphClient(instance, accounts[0]));
      // Photo eligibility rests on SharePoint's Attachments flag; a scan where it
      // is missing can't be trusted, so say so instead of under-reporting photos.
      const unknown = all.filter((e) => !e.attachmentsKnown).length;
      if (unknown) throw new Error(`SharePoint didn't report attachments for ${unknown} entr${unknown === 1 ? "y" : "ies"}`);
      setDue(retentionDue(all, new Date()));
    } catch (e) {
      console.error("[CleanupPanel] check failed:", e);
      // A failed scan must not leave an older due-list actionable.
      setDue(null);
      setMessage((m) => (keepMessage && m ? `${m} Couldn't re-check the log.` : "Couldn't read the log."));
    } finally {
      setChecking(false);
    }
  }

  async function run(job: Job) {
    if (!due || !accounts[0]) return;
    const rows = due[job];
    const what =
      job === "photos"
        ? `delete the photos on ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`
        : job === "staff"
          ? `clear the station-staff name on ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`
          : `permanently delete ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`;
    if (!window.confirm(`This will ${what}. Continue?`)) return;
    setRunning(job);
    setMessage(null);
    const client = getGraphClient(instance, accounts[0]);
    let done = 0;
    let skipped = 0;
    let failed = 0;
    for (const e of rows) {
      try {
        // Re-read and re-check right before acting: the scan may be stale (e.g. the
        // fix date was corrected in another tab, or photos were already removed).
        const fresh = await getEntry(client, e.id);
        if (!fresh.attachmentsKnown) throw new Error(`attachments unknown for entry ${e.id}`);
        if (!stillDue(fresh, job, new Date())) {
          skipped++;
          continue;
        }
        // If-Match on the fresh etag: an edit made after this re-check wins, and
        // the entry is reported as skipped rather than overwritten or deleted.
        if (job === "photos") await deleteAllEntryPhotos(client, e.id, instance, accounts[0]);
        else if (job === "staff")
          await updateEntry(client, e.id, { stationStaffName: "", stationStaffEmail: "" }, fresh.etag);
        else await deleteEntry(client, e.id, fresh.etag);
        done++;
      } catch (err) {
        if (err instanceof EntryChangedError) {
          skipped++;
          continue;
        }
        console.error(`[CleanupPanel] ${job} failed for entry ${e.id}:`, err);
        failed++;
      }
    }
    setRunning(null);
    setMessage(
      `Done: ${done} cleaned up${skipped ? `, ${skipped} no longer due` : ""}${
        failed ? `, ${failed} failed (run it again)` : ""
      }.`
    );
    onDone();
    await check(true);
  }

  const row = (job: Job, label: string) => {
    const n = due?.[job].length ?? 0;
    return (
      <li className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm text-text-primary">
          {label}: <strong>{n}</strong>
        </span>
        <button
          type="button"
          disabled={!n || !!running || checking}
          onClick={() => run(job)}
          className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm disabled:opacity-40"
        >
          {running === job ? "Working…" : "Clean up"}
        </button>
      </li>
    );
  };

  return (
    <details className="bg-bg-card border border-border rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">
        Retention cleanup (admins)
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-sm text-text-secondary">
          Keep photos {RETENTION.photoDays} days, the station-staff name {RETENTION.stationStaffMonths} months, and
          entries {RETENTION.entryYears} years. Run this about once a month. Deleted items sit in the SharePoint
          recycle bin until it empties.
        </p>
        <button
          type="button"
          onClick={() => check()}
          disabled={checking || !!running}
          className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-primary disabled:opacity-50"
        >
          {checking ? "Checking…" : due ? "Check again" : "Check what's due"}
        </button>
        {due && (
          <ul className="divide-y divide-border">
            {row("photos", `Entries with photos older than ${RETENTION.photoDays} days`)}
            {row("staff", `Station-staff names older than ${RETENTION.stationStaffMonths} months`)}
            {row("entries", `Entries older than ${RETENTION.entryYears} years`)}
          </ul>
        )}
        {message && <p className="text-sm text-text-primary">{message}</p>}
      </div>
    </details>
  );
}
