"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { RETENTION, retentionDue, type RetentionDue } from "../fixLog";
import { deleteAllEntryPhotos, deleteEntry, listEntries, updateEntry } from "../fixLogService";

type Job = "photos" | "staff" | "entries";

// Admin-only, run by hand (Justin chose manual cleanup over a scheduled job).
// Applies the attorney's retention periods to the whole log.
export default function CleanupPanel({ onDone }: { onDone: () => void }) {
  const { instance, accounts } = useMsal();
  const [due, setDue] = useState<RetentionDue | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState<Job | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function check() {
    if (!accounts[0]) return;
    setChecking(true);
    setMessage(null);
    try {
      const all = await listEntries(getGraphClient(instance, accounts[0]));
      setDue(retentionDue(all, new Date()));
    } catch (e) {
      console.error("[CleanupPanel] check failed:", e);
      setMessage("Couldn't read the log.");
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
    let failed = 0;
    for (const e of rows) {
      try {
        if (job === "photos") await deleteAllEntryPhotos(client, e.id, instance, accounts[0]);
        else if (job === "staff") await updateEntry(client, e.id, { stationStaffName: "", stationStaffEmail: "" });
        else await deleteEntry(client, e.id);
        done++;
      } catch (err) {
        console.error(`[CleanupPanel] ${job} failed for entry ${e.id}:`, err);
        failed++;
      }
    }
    setRunning(null);
    setMessage(`Done: ${done} updated${failed ? `, ${failed} failed (try again)` : ""}.`);
    onDone();
    await check();
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
          disabled={!n || !!running}
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
          onClick={check}
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
