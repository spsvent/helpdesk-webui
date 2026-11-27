"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_SIZE_MB, validateAttachment } from "@/lib/attachmentValidation";
import { isStillPhoto } from "../fixLog";

// Wording from the attorney check (2026-11-27) — keep it verbatim.
export const PHOTO_GUIDANCE =
  "Photograph the equipment only. No guests, children, staff faces, or screens showing a guest's name or card details. If anyone is in the frame, delete it and retake.";
export const PHOTO_CONFIRM_LABEL = "No people or personal details are visible in these photos.";

// Staged photos for an entry. Still images only (no video: a clip with sound can
// record a counter conversation). `capture` opens the camera directly on phones
// so the shot isn't also left in the camera roll / cloud backup.
export default function PhotoPicker({
  files,
  onChange,
  confirmed,
  onConfirmedChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Thumbnails for the staged files. Created and revoked in the same effect so an
  // abandoned render or a Strict Mode replay can't leak or revoke a shown URL.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function add(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!isStillPhoto(f.name, f.type)) {
        setError(`${f.name} isn't a still photo (JPEG, PNG, HEIC or WebP).`);
        continue;
      }
      const err = validateAttachment(f, DEFAULT_MAX_SIZE_MB);
      if (err) {
        setError(err);
        continue;
      }
      next.push(f);
    }
    if (next.length) {
      onChange([...files, ...next]);
      // A new photo needs a fresh check of what's in frame.
      onConfirmedChange(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-secondary">{PHOTO_GUIDANCE}</p>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative">
            {previews[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previews[i]} alt={f.name} className="w-20 h-20 object-cover rounded-lg border border-border" />
            ) : (
              <span className="block w-20 h-20 rounded-lg border border-border bg-bg-subtle" />
            )}
            <button
              type="button"
              onClick={() => {
                onChange(files.filter((_, j) => j !== i));
                // The confirmation covers the staged set; re-check after any change.
                onConfirmedChange(false);
              }}
              disabled={disabled}
              aria-label={`Remove ${f.name}`}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs leading-6 text-center"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-border text-text-secondary text-xs flex flex-col items-center justify-center hover:border-brand-primary disabled:opacity-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.9a2 2 0 001.7-.9l.8-1.2A2 2 0 0110.1 4h3.8a2 2 0 011.7.9l.8 1.2a2 2 0 001.7.9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          Add photo
        </button>
        <input
          ref={input}
          type="file"
          // Broad "image/*" keeps the phone camera opening reliably; add() then
          // enforces still formats (isStillPhoto rejects GIF and anything else).
          accept="image/*,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <label className="flex items-start gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 w-4 h-4"
          />
          <span>{PHOTO_CONFIRM_LABEL}</span>
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
