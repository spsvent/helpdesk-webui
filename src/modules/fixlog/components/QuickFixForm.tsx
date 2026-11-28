"use client";

import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import { LOCATION_OPTIONS } from "@/lib/locationConfig";
import { trackEvent } from "@/lib/appInsights";
import { FIXLOG_DEPARTMENT, type FixLogEntry, type FixLogIssue, type FixLogWritable } from "../types";
import {
  OTHER_LOCATION,
  describePick,
  effectiveParent,
  fromLocalInputValue,
  isOfficialLocation,
  pushRecentLocation,
  resolveTypedLocation,
  toLocalInputValue,
  validateDraft,
  visibleIssues,
} from "../fixLog";
import { createEntry, syncPhotoCount, updateEntry, uploadEntryPhoto } from "../fixLogService";
import { ensureLocationTicket } from "../locationTicket";
import StaffPicker, { type StationStaff } from "./StaffPicker";
import PhotoPicker from "./PhotoPicker";
import IssuePicker, { EMPTY_PICK, type IssuePick } from "./IssuePicker";

const RECENT_KEY = "fixlog.recentLocations";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type LocationTicketStatus =
  | { kind: "pending" }
  | { kind: "created" | "exists"; ticketNumber?: number }
  | { kind: "failed" };

export interface SaveResult {
  // Unique per save; onLocationTicket reports against it so a late result from an
  // earlier save can be told apart from the current one.
  saveId: string;
  entry: FixLogEntry;
  photoFailures: number;
  // Set when the location was typed under "Other" (not in the official list):
  // "pending" at save time, then reported via onLocationTicket when it finishes.
  locationTicket?: LocationTicketStatus;
}

// The quick-entry form. Create mode (no `initial`) also stages photos; edit mode
// changes the fields only (photos are managed on the detail page).
export default function QuickFixForm({
  issues,
  initial,
  onSaved,
  onLocationTicket,
  onCancel,
}: {
  issues: FixLogIssue[];
  initial?: FixLogEntry;
  onSaved: (r: SaveResult) => void;
  // The new-location ticket runs after the save is acknowledged; this reports it.
  onLocationTicket?: (saveId: string, status: LocationTicketStatus) => void;
  onCancel?: () => void;
}) {
  const { instance, accounts } = useMsal();
  const { permissions } = useRBAC();
  const editing = !!initial;
  // The form only offers active nodes under active folders.
  const tree = useMemo(() => visibleIssues(issues), [issues]);

  // Edit mode starts on the saved issue's folder with it selected, if it's still
  // in the tree; otherwise nothing is pre-picked and the saved text is kept.
  const initialPick: IssuePick = (() => {
    const node = initial?.issueId ? tree.find((i) => i.id === initial.issueId) : undefined;
    // effectiveParent: an orphan (folder deleted) is shown at the top level.
    return node ? { folderId: effectiveParent(tree, node), nodeId: node.id } : EMPTY_PICK;
  })();
  const initialOfficial = !!initial?.location && isOfficialLocation(initial.location);

  const [recent, setRecent] = useState<string[]>([]);
  // The location <select> value: "", an official name, or "Other" (then typed).
  const [locSelect, setLocSelect] = useState(
    initial ? (initialOfficial ? initial.location : OTHER_LOCATION) : ""
  );
  const [customLocation, setCustomLocation] = useState(initial && !initialOfficial ? initial.location : "");
  const [pick, setPick] = useState<IssuePick>(initialPick);
  const [resolution, setResolution] = useState(initial?.resolution || "");
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

  const typed = resolveTypedLocation(customLocation);
  const location = locSelect === OTHER_LOCATION ? typed.name : locSelect;
  // A typed name that isn't (a case/spacing variant of) an official location.
  const isNewLocation = locSelect === OTHER_LOCATION && !!typed.name && !typed.official;

  // Edit mode: the stored issue snapshot (path/id/category) is only rewritten when
  // the user actually picks something different, so renaming/retiring a node later
  // — or the issue list failing to load — never alters an existing entry's history.
  const picked = !!pick.nodeId || (!!pick.other && !!pick.otherText?.trim());
  // A named pick is "changed" only if it's a different node; typed Other always is.
  const issueChanged = !editing || (picked && (!!pick.other || pick.nodeId !== initialPick.nodeId));
  const described = describePick(tree, pick.other ? { folderId: pick.folderId, otherText: pick.otherText } : { nodeId: pick.nodeId });
  const issueLabel = issueChanged ? described.issue : initial?.issue || "";

  function chooseLocation(name: string) {
    if (isOfficialLocation(name)) {
      setLocSelect(name);
      setCustomLocation("");
    } else {
      setLocSelect(OTHER_LOCATION);
      setCustomLocation(name);
    }
  }

  function reset() {
    setLocSelect("");
    setCustomLocation("");
    setPick(EMPTY_PICK);
    setResolution("");
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
    const me = {
      name: permissions?.displayName || accounts[0].name || "",
      email: permissions?.email || accounts[0].username || "",
    };
    try {
      const fields: FixLogWritable = {
        // Blank issueId (not omitted) so switching an edited entry to "Other" clears the old link.
        ...(issueChanged ? { issue: issueLabel, issueId: described.issueId, category: described.category } : {}),
        location,
        ...(timeChanged ? { fixedAt: fixedAtIso } : {}),
        // Edit sends "" to clear a field; create just leaves it out.
        device: device.trim() || (editing ? "" : undefined),
        resolution: resolution.trim() || (editing ? "" : undefined),
        notes: notes.trim() || (editing ? "" : undefined),
        stationStaffName: staff?.name.trim() || (editing ? "" : undefined),
        stationStaffEmail: staff?.email || (editing ? "" : undefined),
      };

      let entry: FixLogEntry;
      let photoFailures = 0;
      if (editing && initial) {
        entry = await updateEntry(client, initial.id, fields);
      } else {
        entry = await createEntry(client, {
          ...fields,
          loggedByName: me.name,
          loggedByEmail: me.email,
          department: FIXLOG_DEPARTMENT,
          photoCount: 0,
        });
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
      }

      // A new (typed) location → one ticket so it gets added to the official list.
      // Started AFTER the save is acknowledged, so a slow ticket call never holds
      // the form (and never tempts anyone to log the same fix twice).
      const wantsTicket = isNewLocation && (!editing || location !== initial?.location);
      const savedEntryId = entry.id;
      const saveId = `${savedEntryId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const runTicket = () =>
        ensureLocationTicket(client, {
          name: location,
          entryId: savedEntryId,
          requesterEmail: me.email,
          requesterName: me.name,
          instance,
          account: accounts[0],
        })
          .then((r) => onLocationTicket?.(saveId, r))
          .catch((e) => {
            console.error("[QuickFixForm] new-location ticket failed:", e);
            onLocationTicket?.(saveId, { kind: "failed" });
          });

      if (!editing) {
        const nextRecent = pushRecentLocation(recent, location);
        setRecent(nextRecent);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
        } catch {
          /* private mode — recent chips just won't persist */
        }
        // Controlled values only — never typed text (issue, location), notes or names.
        trackEvent("QuickFixLogged", {
          location: isNewLocation ? "(new location)" : location,
          category: described.category,
          commonIssue: described.issueId ? "yes" : "no",
        });
        reset();
      }
      onSaved({ saveId, entry, photoFailures, locationTicket: wantsTicket ? { kind: "pending" } : undefined });
      if (wantsTicket) void runTicket();
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
              <button key={l} type="button" onClick={() => chooseLocation(l)} className={chip(location === l)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <select
          value={locSelect}
          onChange={(e) => {
            setLocSelect(e.target.value);
            if (e.target.value !== OTHER_LOCATION) setCustomLocation("");
          }}
          className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
        >
          <option value="">Choose a location…</option>
          {LOCATION_OPTIONS.filter((l) => l !== OTHER_LOCATION).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          <option value={OTHER_LOCATION}>Other (not in the list)…</option>
        </select>
        {locSelect === OTHER_LOCATION && (
          <div className="mt-2">
            <input
              type="text"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              maxLength={100}
              placeholder="Type the location's name"
              autoFocus={!editing}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
            />
            <p className="mt-1 text-xs text-text-secondary">
              {typed.official
                ? `That's already in the list as "${typed.name}" — it will be used.`
                : "Not in the list? Type it here. Saving also opens a ticket to add it to the official list."}
            </p>
          </div>
        )}
      </section>

      {/* 2. Issue */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Issue</h3>
        {editing && initial?.issue && (
          <p className="text-sm text-text-secondary mb-2">
            Currently: <strong className="text-text-primary">{initial.issue}</strong>. Pick something else only to change it.
          </p>
        )}
        <IssuePicker issues={tree} value={pick} onChange={setPick} />
      </section>

      {/* 3. Details (all optional) */}
      <section className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">
            Resolution <span className="font-normal text-text-secondary">(optional)</span>
          </label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            placeholder="What fixed it, e.g. restarted the register, replaced the paper roll"
            className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">
            Note <span className="font-normal text-text-secondary">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything else, e.g. what was wrong or what to watch for"
            className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
          />
          <p className="mt-1 text-xs text-text-secondary">
            In both boxes, describe the equipment and the fix, not people.
          </p>
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
