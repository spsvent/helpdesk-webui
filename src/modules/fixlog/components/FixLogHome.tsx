"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { FixLogEntry, FixLogIssue } from "../types";
import { RANGE_OPTIONS, filterEntries, rangeStartIso, topCounts } from "../fixLog";
import { listEntries, listIssues } from "../fixLogService";
import { canRunCleanup } from "../access";
import QuickFixForm, { type SaveResult } from "./QuickFixForm";
import CleanupPanel from "./CleanupPanel";

// Year shown when asked for, or whenever it isn't the current year.
export function formatWhen(iso: string, opts?: { year?: boolean }): string {
  const d = new Date(iso);
  const showYear = opts?.year || d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleString(undefined, {
    ...(showYear ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FixLogHome() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions } = useRBAC();

  const [issues, setIssues] = useState<FixLogIssue[]>([]);
  const [entries, setEntries] = useState<FixLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);

  const [rangeDays, setRangeDays] = useState<number>(30);
  const [location, setLocation] = useState("");
  const [issue, setIssue] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!account) return;
    listIssues(getGraphClient(instance, account))
      .then(setIssues)
      .catch((e) => console.error("[FixLog] issues load failed:", e));
  }, [account, instance]);

  // Only the newest request may update the list (switching ranges quickly must not
  // let an older, slower response win).
  const loadGen = useRef(0);
  const loadEntries = useCallback(async () => {
    if (!account) return;
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    try {
      const since = rangeStartIso(rangeDays, new Date());
      const rows = await listEntries(getGraphClient(instance, account), since);
      if (gen === loadGen.current) setEntries(rows);
    } catch (e) {
      console.error("[FixLog] entries load failed:", e);
      if (gen === loadGen.current) setError("Couldn't load the fix log.");
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [account, instance, rangeDays]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const shown = useMemo(
    () =>
      filterEntries(entries, {
        location: location || undefined,
        issue: issue || undefined,
        mineEmail: mineOnly ? permissions?.email : undefined,
        search,
      }),
    [entries, location, issue, mineOnly, permissions?.email, search]
  );
  const topLocations = useMemo(() => topCounts(shown, "location"), [shown]);
  const topIssues = useMemo(() => topCounts(shown, "issue"), [shown]);
  const locationChoices = useMemo(() => Array.from(new Set(entries.map((e) => e.location))).sort(), [entries]);
  const issueChoices = useMemo(() => Array.from(new Set(entries.map((e) => e.issue))).sort(), [entries]);

  function handleSaved(r: SaveResult) {
    setSaved(r);
    // Add it to the list only if it falls inside the range being shown.
    const since = rangeStartIso(rangeDays, new Date());
    const inRange = !since || new Date(r.entry.fixedAt).getTime() >= new Date(since).getTime();
    setEntries((prev) => {
      const rest = prev.filter((e) => e.id !== r.entry.id);
      return inRange ? [r.entry, ...rest] : rest;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const selectCls =
    "px-2 py-1.5 border border-border rounded-lg bg-bg-card text-text-primary text-sm max-w-full";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Quick Fix Log</h1>
          <p className="text-sm text-text-secondary">IT fixes that didn&apos;t start as a ticket.</p>
        </div>
        <Link href="/fixlog?view=issues" className="text-sm text-brand-primary underline">
          Manage issues
        </Link>
      </div>

      {saved && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            saved.photoFailures
              ? "border-yellow-300 bg-yellow-50 text-yellow-900"
              : "border-green-300 bg-green-50 text-green-900"
          }`}
        >
          Logged <strong>{saved.entry.issue}</strong> at {saved.entry.location}.{" "}
          {saved.photoFailures > 0 && (
            <>
              {saved.photoFailures} photo{saved.photoFailures > 1 ? "s" : ""} didn&apos;t upload. Open the entry to
              try again.{" "}
            </>
          )}
          <Link href={`/fixlog?id=${saved.entry.id}`} className="underline">
            View entry
          </Link>
          <button type="button" onClick={() => setSaved(null)} className="ml-3 underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Log a fix</h2>
        <QuickFixForm issues={issues} onSaved={handleSaved} />
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Recent fixes</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className={selectCls}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
            <option value="">All locations</option>
            {locationChoices.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select value={issue} onChange={(e) => setIssue(e.target.value)} className={selectCls}>
            <option value="">All issues</option>
            {issueChoices.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-sm text-text-primary">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Only mine
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, device…"
            className="flex-1 min-w-[10rem] px-2 py-1.5 border border-border rounded-lg bg-bg-card text-text-primary text-sm"
          />
        </div>

        {loading ? (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="bg-bg-card border border-border rounded-lg p-3">
                <div className="text-2xl font-semibold text-text-primary">{shown.length}</div>
                <div className="text-xs text-text-secondary">fixes shown</div>
              </div>
              <TopList title="Top locations" rows={topLocations} />
              <TopList title="Top issues" rows={topIssues} />
            </div>

            {shown.length === 0 ? (
              <p className="text-sm text-text-secondary py-4">No fixes match.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg bg-bg-card">
                {shown.map((e) => (
                  <li key={e.id}>
                    <Link href={`/fixlog?id=${e.id}`} className="block px-3 py-2.5 hover:bg-bg-subtle">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-text-primary">{e.issue}</span>
                        <span className="text-xs text-text-secondary whitespace-nowrap">{formatWhen(e.fixedAt)}</span>
                      </div>
                      <div className="text-sm text-text-secondary">
                        {e.location}
                        {e.device && <> · {e.device}</>}
                        {(e.photoCount > 0 || e.hasAttachments) && (
                          <span className="ml-1" title="Has photos">
                            · 📷{e.photoCount > 0 ? ` ${e.photoCount}` : ""}
                          </span>
                        )}
                        <span className="ml-1">· {e.loggedByName || e.loggedByEmail}</span>
                      </div>
                      {e.notes && <div className="text-sm text-text-primary truncate">{e.notes}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {canRunCleanup(permissions) && <CleanupPanel onDone={loadEntries} />}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-3">
      <div className="text-xs font-semibold text-text-secondary mb-1">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-text-secondary">None</div>
      ) : (
        <ol className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-2 text-sm text-text-primary">
              <span className="truncate">{r.label}</span>
              <span className="text-text-secondary">{r.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
