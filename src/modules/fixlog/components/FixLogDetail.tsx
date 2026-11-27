"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { isBrowserPreviewable } from "@/lib/attachmentComments";
import type { Attachment } from "@/types/ticket";
import type { FixLogEntry, FixLogIssue } from "../types";
import { canModifyEntry } from "../access";
import {
  deleteEntry,
  deleteEntryPhoto,
  downloadEntryPhoto,
  getEntry,
  listEntryPhotos,
  listIssues,
  syncPhotoCount,
  uploadEntryPhoto,
} from "../fixLogService";
import QuickFixForm from "./QuickFixForm";
import PhotoPicker from "./PhotoPicker";
import { formatWhen } from "./FixLogHome";

export default function FixLogDetail({ id }: { id: string }) {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions } = useRBAC();

  const [entry, setEntry] = useState<FixLogEntry | null>(null);
  const [issues, setIssues] = useState<FixLogIssue[] | null>(null);
  const [photos, setPhotos] = useState<Attachment[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // Read failures (listing) and action failures (upload/delete) are kept apart so
  // a successful reload never wipes the message about a failed upload.
  const [photoLoadError, setPhotoLoadError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [photosPending, setPhotosPending] = useState(false);

  const loadPhotos = useCallback(async () => {
    if (!account) return;
    try {
      setPhotos(await listEntryPhotos(getGraphClient(instance, account), id, instance, account));
      setPhotoLoadError(null);
    } catch (e) {
      console.error("[FixLogDetail] photos load failed:", e);
      setPhotoLoadError("Couldn't load photos.");
    }
  }, [account, instance, id]);

  useEffect(() => {
    if (!account) return;
    const client = getGraphClient(instance, account);
    getEntry(client, id)
      .then(setEntry)
      .catch((e) => {
        console.error("[FixLogDetail] load failed:", e);
        setError("Couldn't load this entry. It may have been deleted.");
      });
    listIssues(client)
      .then(setIssues)
      .catch(() => setIssues([]));
    loadPhotos();
  }, [account, instance, id, loadPhotos]);

  // Fetch previewable photos as object URLs (auth'd download), revoked on change.
  useEffect(() => {
    if (!account || photos.length === 0) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const client = getGraphClient(instance, account);
      const next: Record<string, string> = {};
      for (const p of photos) {
        if (!isBrowserPreviewable(p.name)) continue;
        const blob = await downloadEntryPhoto(client, id, p.name, instance, account);
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          made.push(url);
          next[p.name] = url;
        }
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [account, instance, id, photos]);

  async function openPhoto(name: string) {
    if (!account) return;
    const blob = await downloadEntryPhoto(getGraphClient(instance, account), id, name, instance, account);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function removePhoto(name: string) {
    if (!account || !window.confirm(`Delete photo ${name}?`)) return;
    setBusy(true);
    setPhotoError(null);
    const client = getGraphClient(instance, account);
    try {
      const ok = await deleteEntryPhoto(client, id, name, instance, account);
      if (!ok) setPhotoError(`Couldn't delete ${name}.`);
      const count = await syncPhotoCount(client, id, instance, account);
      setEntry((e) => (e ? { ...e, photoCount: count } : e));
    } catch (e) {
      console.error("[FixLogDetail] photo delete failed:", e);
      setPhotoError("Couldn't update photos.");
    } finally {
      await loadPhotos();
      setBusy(false);
    }
  }

  async function uploadPhotos() {
    if (!account || newPhotos.length === 0 || photosPending) return;
    if (!confirmed) {
      setPhotoError("Tick the box confirming no people or personal details are in the photos.");
      return;
    }
    setBusy(true);
    setPhotoError(null);
    const client = getGraphClient(instance, account);
    const failedFiles: File[] = [];
    for (const f of newPhotos) {
      const ok = await uploadEntryPhoto(client, id, f, instance, account).catch(() => null);
      if (!ok) failedFiles.push(f);
    }
    const failed = failedFiles.length;
    try {
      const count = await syncPhotoCount(client, id, instance, account);
      setEntry((e) => (e ? { ...e, photoCount: count } : e));
    } catch (e) {
      console.warn("[FixLogDetail] photo count sync failed:", e);
    }
    if (failed) setPhotoError(`${failed} photo${failed > 1 ? "s" : ""} didn't upload. Try again.`);
    // Keep the ones that failed staged so "Upload" can simply be pressed again.
    setNewPhotos(failedFiles);
    setConfirmed(false);
    await loadPhotos();
    setBusy(false);
  }

  async function handleDelete() {
    if (!account || !entry) return;
    if (!window.confirm("Delete this entry and its photos? This can't be undone from the app.")) return;
    setBusy(true);
    try {
      await deleteEntry(getGraphClient(instance, account), id);
      router.push("/fixlog");
    } catch (e) {
      console.error("[FixLogDetail] delete failed:", e);
      setError("Couldn't delete this entry.");
      setBusy(false);
    }
  }

  if (error)
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/fixlog" className="mt-3 inline-block text-sm text-brand-primary underline">
          Back to the fix log
        </Link>
      </div>
    );
  if (!entry || issues === null) return <LoadingSpinner />;

  const canModify = canModifyEntry(entry, permissions);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/fixlog" className="text-sm text-brand-primary underline">
        ← Fix log
      </Link>

      {editing ? (
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6">
          <h1 className="text-base font-semibold text-text-primary mb-4">Edit fix</h1>
          <QuickFixForm
            issues={issues}
            initial={entry}
            onSaved={(r) => {
              setEntry(r.entry);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{entry.issue}</h1>
              <p className="text-sm text-text-secondary">
                {entry.location}
                {entry.category && <> · {entry.category}</>}
              </p>
            </div>
            {canModify && (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-primary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-secondary">Fixed</dt>
            <dd className="text-text-primary">{formatWhen(entry.fixedAt, { year: true })}</dd>
            {/* Always shown: the real save time, kept alongside a back-dated fix time. */}
            <dt className="text-text-secondary">Logged</dt>
            <dd className="text-text-primary">{formatWhen(entry.created, { year: true })}</dd>
            <dt className="text-text-secondary">Logged by</dt>
            <dd className="text-text-primary">{entry.loggedByName || entry.loggedByEmail}</dd>
            {entry.device && (
              <>
                <dt className="text-text-secondary">Device</dt>
                <dd className="text-text-primary">{entry.device}</dd>
              </>
            )}
            {entry.stationStaffName && (
              <>
                <dt className="text-text-secondary">At the station</dt>
                <dd className="text-text-primary">{entry.stationStaffName}</dd>
              </>
            )}
          </dl>

          {entry.notes && <p className="text-sm text-text-primary whitespace-pre-wrap">{entry.notes}</p>}
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Photos</h2>
        {photos.length === 0 && !photoLoadError && <p className="text-sm text-text-secondary">No photos.</p>}
        {photoLoadError && <p className="text-sm text-red-600">{photoLoadError}</p>}
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.name} className="relative">
              <button type="button" onClick={() => openPhoto(p.name)} title={p.name}>
                {photoUrls[p.name] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrls[p.name]}
                    alt={p.name}
                    className="w-28 h-28 object-cover rounded-lg border border-border"
                  />
                ) : (
                  <span className="w-28 h-28 rounded-lg border border-border flex items-center justify-center text-xs text-text-secondary p-2 break-all">
                    {p.name}
                  </span>
                )}
              </button>
              {canModify && (
                <button
                  type="button"
                  onClick={() => removePhoto(p.name)}
                  disabled={busy}
                  aria-label={`Delete ${p.name}`}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs leading-6 text-center"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {canModify && (
          <div className="space-y-2">
            <PhotoPicker
              files={newPhotos}
              onChange={setNewPhotos}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              onPendingChange={setPhotosPending}
              disabled={busy}
            />
            {newPhotos.length > 0 && (
              <button
                type="button"
                onClick={uploadPhotos}
                disabled={busy || photosPending}
                className="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium disabled:opacity-60"
              >
                {busy ? "Uploading…" : `Upload ${newPhotos.length} photo${newPhotos.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        )}
        {photoError && <p className="text-sm text-red-600">{photoError}</p>}
      </div>
    </div>
  );
}
