"use client";

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import { LOCATION_OPTIONS } from "@/lib/locationConfig";
import { trackEvent } from "@/lib/appInsights";
import { FIXLOG_DEPARTMENT, type FixLogEntry, type FixLogIssue, type FixLogWritable } from "../types";
import {
  fromLocalInputValue,
  pushRecentLocation,
  sortIssues,
  toLocalInputValue,
  validateDraft,
} from "../fixLog";
import { createEntry, syncPhotoCount, updateEntry, uploadEntryPhoto } from "../fixLogService";
import StaffPicker, { type StationStaff } from "./StaffPicker";
import PhotoPicker from "./PhotoPicker";

const RECENT_KEY = "fixlog.recentLocations";
const OTHER = "__other__";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface SaveResult {
  entry: FixLogEntry;
  photoFailures: number;
}

// The quick-entry form. Create mode (no `initial`) also stages photos; edit mode
// changes the fields only (photos are managed on the detail page).
export default function QuickFixForm({
  issues,
  initial,
  onSaved,
  onCancel,
}: {
  issues: FixLogIssue[];
  initial?: FixLogEntry;
  onSaved: (r: SaveResult) => void;
  onCancel?: () => void;
}) {
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const editing = !!initial;
  const sorted = useMemo(() => sortIssues(issues), [issues]);

  // Edit mode: match the saved issue to a button by id, then by label; else "Other".
  const initialChoice = (() => {
    if (!initial) return "";
    const hit =
      sorted.find((i) => i.id === initial.issueId) || sorted.find((i) => i.label === initial.issue);
    return hit ? hit.id : OTHER;
  })();

  const [recent, setRecent] = useState<string[]>([]);
  const [location, setLocation] = useState(initial?.location || "");
  const [choice, setChoice] = useState(initialChoice);
  const [otherText, setOtherText] = useState(initialChoice === OTHER ? initial?.issue || "" : "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [device, setDevice] = useState(initial?.device || "");
  const [staff, setStaff] = useState<StationStaff | null>(
    initial?.stationStaffName ? { name: initial.stationStaffName, email: initial.stationStaffEmail } : null
  );
  const [customTime, setCustomTime] = useState(editing);
  // Edit mode keeps the original ISO FixedAt unless this box is actually changed
  // (the minute-precision local value would drop seconds and can shift across DST).
  const initialTimeValue = initial ? toLocalInputValue(new Date(initial.fixedAt)) : "";
  const [timeValue, setTimeValue] = useState(initialTimeValue);
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [photosPending, setPhotosPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  // Location options: the standard list, plus the saved value if it's no longer in it.
  const locations = useMemo<string[]>(() => {
    const base: string[] = [...LOCATION_OPTIONS];
    if (initial?.location && !base.includes(initial.location)) base.unshift(initial.location);
    return base;
  }, [initial?.location]);

  const picked = sorted.find((i) => i.id === choice);
  // Edit mode: the stored issue snapshot (label/id/category) is only rewritten when
  // the user changes the selection, so renaming/retiring an issue later — or the
  // issue list failing to load — never alters an existing entry's history.
  const issueChanged =
    !editing || choice !== initialChoice || (choice === OTHER && otherText.trim() !== (initial?.issue || ""));
  const issueLabel = !issueChanged
    ? initial?.issue || ""
    : choice === OTHER
      ? otherText.trim()
      : picked?.label || "";

  function reset() {
    setLocation("");
    setChoice("");
    setOtherText("");
    setNotes("");
    setDevice("");
    setStaff(null);
    setCustomTime(false);
    setTimeValue("");
    setFiles([]);
    setConfirmed(false);
  }

  async function handleSave() {
    // Not while a picked photo is still being checked (it would be left out).
    if (!accounts[0] || saving || photosPending) return;
    const now = new Date();
    const timeChanged = !editing || timeValue !== initialTimeValue;
    const fixedAtIso = !timeChanged
      ? initial?.fixedAt
      : customTime
        ? fromLocalInputValue(timeValue)
        : now.toISOString();
    const err = validateDraft(
      { location, issue: issueLabel, fixedAtIso, photoCount: files.length, photosConfirmed: confirmed },
      now
    );
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    const client = getGraphClient(instance, accounts[0]);
    try {
      const fields: FixLogWritable = {
        ...(issueChanged
          ? {
              issue: issueLabel,
              // Blank (not omitted) so switching an edited entry to "Other" clears the old link.
              issueId: picked?.id || "",
              category: picked?.category || "",
            }
          : {}),
        location,
        ...(timeChanged ? { fixedAt: fixedAtIso } : {}),
        // Edit sends "" to clear a field; create just leaves it out.
        device: device.trim() || (editing ? "" : undefined),
        notes: notes.trim() || (editing ? "" : undefined),
        stationStaffName: staff?.name.trim() || (editing ? "" : undefined),
        stationStaffEmail: staff?.email || (editing ? "" : undefined),
      };

      if (editing && initial) {
        const entry = await updateEntry(client, initial.id, fields);
        onSaved({ entry, photoFailures: 0 });
        return;
      }

      let entry = await createEntry(client, {
        ...fields,
        loggedByName: permissions?.displayName || accounts[0].name || "",
        loggedByEmail: permissions?.email || accounts[0].username || "",
        department: FIXLOG_DEPARTMENT,
        photoCount: 0,
      });

      let photoFailures = 0;
      if (files.length) {
        for (const f of files) {
          const ok = await uploadEntryPhoto(client, entry.id, f, instance, accounts[0]).catch(() => null);
          if (!ok) photoFailures++;
        }
        try {
          const count = await syncPhotoCount(client, entry.id, instance, accounts[0]);
          entry = { ...entry, photoCount: count };
        } catch (e) {
          console.warn("[QuickFixForm] photo count sync failed:", e);
        }
      }

      const nextRecent = pushRecentLocation(recent, location);
      setRecent(nextRecent);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
      } catch {
        /* private mode — recent chips just won't persist */
      }
      // Controlled values only — never the typed "Other" text, notes or names.
      trackEvent("QuickFixLogged", {
        location,
        category: picked?.category || "",
        commonIssue: picked ? "yes" : "no",
      });
      reset();
      onSaved({ entry, photoFailures });
    } catch (e) {
      console.error("[QuickFixForm] save failed:", e);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean) =>
    `px-3 py-2 rounded-lg border text-sm text-left transition-colors touch-manipulation ${
      active
        ? "border-brand-primary bg-brand-primary/10 text-text-primary font-medium ring-1 ring-brand-primary"
        : "border-border bg-bg-card text-text-primary hover:border-brand-primary"
    }`;

  return (
    <div className="space-y-5">
      {/* 1. Location */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Location</h3>
        {recent.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {recent.map((l) => (
              <button key={l} type="button" onClick={() => setLocation(l)} className={chip(location === l)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
        >
          <option value="">Choose a location…</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </section>

      {/* 2. Issue */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Issue</h3>
        {sorted.length === 0 && (
          <p className="text-sm text-text-secondary mb-2">
            No common issues set up yet. Use Other, or add some under Manage issues.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sorted.map((i) => (
            <button key={i.id} type="button" onClick={() => setChoice(i.id)} className={chip(choice === i.id)}>
              {i.label}
            </button>
          ))}
          <button type="button" onClick={() => setChoice(OTHER)} className={chip(choice === OTHER)}>
            Other…
          </button>
        </div>
        {choice === OTHER && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            maxLength={255}
            placeholder="What was the issue?"
            autoFocus
            className="mt-2 w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
          />
        )}
      </section>

      {/* 3. Details (all optional) */}
      <section className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">
            Note <span className="font-normal text-text-secondary">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What you did to fix it"
            className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
          />
          <p className="mt-1 text-xs text-text-secondary">Describe the equipment and the fix, not people.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">
            Device <span className="font-normal text-text-secondary">(optional)</span>
          </label>
          <input
            type="text"
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            maxLength={255}
            placeholder="e.g. Register 2, back office printer"
            className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">
            Person at the station <span className="font-normal text-text-secondary">(optional)</span>
          </label>
          <StaffPicker value={staff} onChange={setStaff} />
          <p className="mt-1 text-xs text-text-secondary">
            Optional. Only so IT can follow up about this fix. Not used to evaluate anyone. Removed after 12
            months.
          </p>
        </div>

        {!editing && (
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              Photos <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <PhotoPicker
              files={files}
              onChange={setFiles}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              onPendingChange={setPhotosPending}
              disabled={saving}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">When</label>
          {customTime ? (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={timeValue}
                max={toLocalInputValue(new Date())}
                onChange={(e) => setTimeValue(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
              />
              {!editing && (
                <button
                  type="button"
                  onClick={() => setCustomTime(false)}
                  className="text-sm text-brand-primary underline"
                >
                  Use now
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-primary">
              Now{" "}
              <button
                type="button"
                onClick={() => {
                  setTimeValue(toLocalInputValue(new Date()));
                  setCustomTime(true);
                }}
                className="ml-2 text-brand-primary underline"
              >
                Change
              </button>
            </p>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg border border-border text-text-primary text-sm"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || photosPending}
          className="px-5 py-2.5 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-light disabled:opacity-60 touch-manipulation"
        >
          {saving ? "Saving…" : photosPending ? "Checking photo…" : editing ? "Save changes" : "Log fix"}
        </button>
      </div>
    </div>
  );
}
