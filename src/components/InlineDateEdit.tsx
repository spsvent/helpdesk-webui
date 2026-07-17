"use client";

import { useEffect, useState } from "react";

// Inline, autosaving date cell used in the purchase queues/tables so Inventory (and
// purchasers/admins) can adjust a line item's expected delivery date in place. The
// input is optimistic — it shows the picked value immediately, calls onSave, and
// surfaces a tiny "saving…" / retry hint. onSave is expected to throw on failure so
// the cell can flag it; the parent owns the actual persistence + state update.
export default function InlineDateEdit({
  value,
  onSave,
  ariaLabel = "Date",
}: {
  value?: string;
  onSave: (iso: string) => void | Promise<void>;
  ariaLabel?: string;
}) {
  // Bind to the yyyy-mm-dd prefix — a stored full-ISO datetime would otherwise be
  // rejected by the native date input. Re-sync when the parent hands back a new value.
  const [val, setVal] = useState((value ?? "").slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setVal((value ?? "").slice(0, 10)), [value]);

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        value={val}
        disabled={saving}
        onChange={async (e) => {
          const next = e.target.value;
          setVal(next);
          setFailed(false);
          setSaving(true);
          try {
            await onSave(next);
          } catch {
            setFailed(true);
          } finally {
            setSaving(false);
          }
        }}
        className="px-1.5 py-0.5 border border-border rounded text-xs bg-bg-card disabled:opacity-60"
        aria-label={ariaLabel}
      />
      {saving && <span className="text-[10px] text-text-secondary">saving…</span>}
      {failed && (
        <span className="text-[10px] text-red-600" title="Save failed — pick the date again to retry">
          !
        </span>
      )}
    </span>
  );
}
