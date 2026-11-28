"use client";

import { useMemo } from "react";
import type { FixLogIssue } from "../types";
import { childrenOf, hasChildren, pathLabel, pathTo } from "../fixLog";

// Where the user is in the tree and what they picked. `folderId` is the folder
// being browsed ("" = top). Either `nodeId` (a box) or `other` (typed text in
// this folder) is the pick.
export interface IssuePick {
  folderId: string;
  nodeId?: string;
  other?: boolean;
  otherText?: string;
}

export const EMPTY_PICK: IssuePick = { folderId: "" };

const box = (active: boolean) =>
  `px-3 py-2.5 rounded-lg border text-sm text-left transition-colors touch-manipulation flex items-center justify-between gap-2 ${
    active
      ? "border-brand-primary bg-brand-primary/10 text-text-primary font-medium ring-1 ring-brand-primary"
      : "border-border bg-bg-card text-text-primary hover:border-brand-primary"
  }`;

/**
 * Directory-style picker: boxes for the current folder. A folder box opens it;
 * an issue box selects it; "Other…" lets you type an issue in the current folder.
 * `issues` must already be the visible (active) tree.
 */
export default function IssuePicker({
  issues,
  value,
  onChange,
}: {
  issues: FixLogIssue[];
  value: IssuePick;
  onChange: (v: IssuePick) => void;
}) {
  // A folder that vanished (retired/deleted meanwhile) falls back to the top.
  const folderId = value.folderId && issues.some((i) => i.id === value.folderId) ? value.folderId : "";
  const crumbs = useMemo(() => (folderId ? pathTo(issues, folderId) : []), [issues, folderId]);
  const items = useMemo(() => childrenOf(issues, folderId), [issues, folderId]);
  const selected = value.nodeId ? pathTo(issues, value.nodeId) : [];

  const open = (id: string) => onChange({ folderId: id });

  return (
    <div className="space-y-2">
      <nav aria-label="Issue folders" className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => open("")}
          className={folderId ? "text-brand-primary underline" : "font-semibold text-text-primary"}
        >
          All issues
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-text-secondary">›</span>
            {i === crumbs.length - 1 ? (
              <span className="font-semibold text-text-primary">{c.label}</span>
            ) : (
              <button type="button" onClick={() => open(c.id)} className="text-brand-primary underline">
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      {items.length === 0 && !folderId && (
        <p className="text-sm text-text-secondary">
          No common issues set up yet. Use Other, or add some under Manage issues.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((i) => {
          const folder = hasChildren(issues, i.id);
          const count = folder ? childrenOf(issues, i.id).length : 0;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => (folder ? open(i.id) : onChange({ folderId, nodeId: i.id }))}
              aria-label={folder ? `${i.label}, folder with ${count} options` : i.label}
              className={box(!folder && value.nodeId === i.id)}
            >
              <span>{i.label}</span>
              {folder && (
                <span className="shrink-0 text-xs text-text-secondary" aria-hidden>
                  {count} ›
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ folderId, other: true, otherText: value.other ? value.otherText : "" })}
          className={box(!!value.other)}
        >
          Other…
        </button>
      </div>

      {value.other && (
        <input
          type="text"
          value={value.otherText || ""}
          onChange={(e) => onChange({ folderId, other: true, otherText: e.target.value })}
          maxLength={200}
          placeholder={crumbs.length ? `Describe the ${crumbs[crumbs.length - 1].label} issue` : "What was the issue?"}
          autoFocus
          className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
        />
      )}

      {(selected.length > 0 || (value.other && value.otherText?.trim())) && (
        <p className="text-sm text-text-primary">
          <span className="text-text-secondary">Selected: </span>
          <strong>
            {selected.length ? pathLabel(selected) : pathLabel(crumbs, value.otherText?.trim())}
          </strong>
        </p>
      )}
    </div>
  );
}
