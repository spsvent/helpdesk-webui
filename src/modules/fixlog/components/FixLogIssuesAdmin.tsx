"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FIXLOG_DEPARTMENT, type FixLogIssue, type FixLogIssueWritable } from "../types";
import { PATH_SEPARATOR, childrenOf, descendantIds, moveTargets, nextSortOrder, pathLabel, pathTo } from "../fixLog";
import { createIssue, deleteIssue, isFixLogIssuesConfigured, listIssues, updateIssue } from "../fixLogService";

const inputCls = "px-2 py-1.5 border border-border rounded-lg bg-bg-card text-text-primary text-sm";

// Tree editor for the quick-pick issues. Browse folders like the form; add options
// to the folder you're in; open any option to give it sub-options (that turns it
// into a folder). Open to everyone who can use the log (IT + admins).
export default function FixLogIssuesAdmin() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [issues, setIssues] = useState<FixLogIssue[]>([]);
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setIssues(await listIssues(getGraphClient(instance, account), { includeInactive: true }));
      setError(null);
    } catch (e) {
      console.error("[FixLogIssuesAdmin] load failed:", e);
      setError("Couldn't load issues.");
    } finally {
      setLoading(false);
    }
  }, [account, instance]);

  useEffect(() => {
    load();
  }, [load]);

  // A folder deleted meanwhile drops the view back to the top.
  const current = folderId && issues.some((i) => i.id === folderId) ? folderId : "";
  const crumbs = useMemo(() => (current ? pathTo(issues, current) : []), [issues, current]);
  const items = useMemo(() => childrenOf(issues, current), [issues, current]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      console.error("[FixLogIssuesAdmin] save failed:", e);
      setError("Couldn't save that change.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const client = () => getGraphClient(instance, account!);

  function add() {
    const label = newLabel.trim();
    // Enter can fire while a write (or the first load) is still running.
    if (!label || busy || loading) return;
    if (label.includes(PATH_SEPARATOR.trim())) {
      setError(`Names can't contain "${PATH_SEPARATOR.trim()}".`);
      return;
    }
    if (items.some((i) => i.label.toLowerCase() === label.toLowerCase())) {
      setError("That option already exists in this folder.");
      return;
    }
    act(async () => {
      await createIssue(client(), {
        label,
        parentId: current,
        sortOrder: nextSortOrder(items),
        active: true,
        department: FIXLOG_DEPARTMENT,
      });
      setNewLabel("");
    });
  }

  // Swap with the neighbour. Re-spaces the pair if they share a SortOrder.
  function move(index: number, dir: -1 | 1) {
    const a = items[index];
    const b = items[index + dir];
    if (!a || !b) return;
    const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + dir : b.sortOrder;
    act(async () => {
      await updateIssue(client(), a.id, { sortOrder: aOrder });
      await updateIssue(client(), b.id, { sortOrder: a.sortOrder });
    });
  }

  function moveTo(node: FixLogIssue, parentId: string) {
    if (parentId === node.parentId) return;
    const siblings = childrenOf(issues, parentId);
    if (siblings.some((i) => i.label.toLowerCase() === node.label.toLowerCase())) {
      setError(`"${node.label}" already exists in that folder.`);
      return;
    }
    act(() => updateIssue(client(), node.id, { parentId, sortOrder: nextSortOrder(siblings) }));
  }

  function remove(node: FixLogIssue) {
    const below = descendantIds(issues, node.id);
    const msg = below.length
      ? `Delete "${node.label}" and the ${below.length} option${below.length > 1 ? "s" : ""} inside it? Fixes already logged keep their issue text. Retire it instead to just hide it.`
      : `Delete "${node.label}"? Fixes already logged keep their issue text. Retire it instead to just hide it.`;
    if (!window.confirm(msg)) return;
    // Children first, so a failure part-way never leaves orphans pointing at a gone folder.
    act(async () => {
      for (const id of [...below].reverse()) await deleteIssue(client(), id);
      await deleteIssue(client(), node.id);
    });
  }

  if (!isFixLogIssuesConfigured())
    return <p className="text-sm text-text-secondary">The issues list isn&apos;t configured yet.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/fixlog" className="text-sm text-brand-primary underline">
        ← Fix log
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Common issues</h1>
        <p className="text-sm text-text-secondary">
          These are the folders and options on the fix form. Open any option to add sub-options inside it — that
          turns it into a folder. Retire an option to hide it (and everything inside it) without affecting fixes
          already logged.
        </p>
      </div>

      <nav aria-label="Folders" className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setFolderId("")}
          className={current ? "text-brand-primary underline" : "font-semibold text-text-primary"}
        >
          All issues
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-text-secondary">›</span>
            {i === crumbs.length - 1 ? (
              <span className="font-semibold text-text-primary">{c.label}</span>
            ) : (
              <button type="button" onClick={() => setFolderId(c.id)} className="text-brand-primary underline">
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="bg-bg-card border border-border rounded-xl p-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={80}
          placeholder={crumbs.length ? `New option in ${crumbs[crumbs.length - 1].label}` : "New top-level option, e.g. POS"}
          className={`${inputCls} flex-1 min-w-[12rem]`}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || loading || !newLabel.trim()}
          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {current ? "Nothing inside yet. Add the first sub-option above." : "No issues yet. Add the first one above."}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl bg-bg-card">
          {items.map((issue, i) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              childCount={childrenOf(issues, issue.id).length}
              targets={moveTargets(issues, issue.id)}
              allIssues={issues}
              first={i === 0}
              last={i === items.length - 1}
              busy={busy}
              onOpen={() => setFolderId(issue.id)}
              onMove={(dir) => move(i, dir)}
              onMoveTo={(parentId) => moveTo(issue, parentId)}
              onSave={(patch) => act(() => updateIssue(client(), issue.id, patch))}
              onDelete={() => remove(issue)}
              siblingLabels={items.filter((x) => x.id !== issue.id).map((x) => x.label.toLowerCase())}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  childCount,
  targets,
  allIssues,
  first,
  last,
  busy,
  onOpen,
  onMove,
  onMoveTo,
  onSave,
  onDelete,
  siblingLabels,
  onError,
}: {
  issue: FixLogIssue;
  childCount: number;
  targets: FixLogIssue[];
  allIssues: FixLogIssue[];
  first: boolean;
  last: boolean;
  busy: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
  onMoveTo: (parentId: string) => void;
  onSave: (patch: FixLogIssueWritable) => void;
  onDelete: () => void;
  siblingLabels: string[];
  onError: (msg: string) => void;
}) {
  const [label, setLabel] = useState(issue.label);
  useEffect(() => setLabel(issue.label), [issue.label]);
  const dirty = label.trim() !== issue.label;
  const btn = "px-2.5 py-1.5 rounded-lg border border-border text-sm text-text-primary disabled:opacity-40";
  const arrow = "w-7 h-7 rounded border border-border text-text-secondary disabled:opacity-30";

  function rename() {
    const next = label.trim();
    if (!next) return;
    if (next.includes(PATH_SEPARATOR.trim())) return onError(`Names can't contain "${PATH_SEPARATOR.trim()}".`);
    if (siblingLabels.includes(next.toLowerCase())) return onError("That option already exists in this folder.");
    onSave({ label: next });
  }

  return (
    <li className={`p-3 flex flex-wrap items-center gap-2 ${issue.active ? "" : "opacity-60"}`}>
      <div className="flex gap-1">
        <button type="button" className={arrow} disabled={first || busy} onClick={() => onMove(-1)} aria-label="Move up">
          ↑
        </button>
        <button type="button" className={arrow} disabled={last || busy} onClick={() => onMove(1)} aria-label="Move down">
          ↓
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && !busy && rename()}
        maxLength={80}
        aria-label="Name"
        className={`${inputCls} flex-1 min-w-[10rem]`}
      />
      {dirty && (
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={rename}
          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm disabled:opacity-50"
        >
          Save
        </button>
      )}
      <button type="button" disabled={busy} onClick={onOpen} className={btn}>
        {childCount ? `Open (${childCount}) ›` : "Add sub-options ›"}
      </button>
      <select
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onMoveTo(e.target.value === "__top__" ? "" : e.target.value)}
        aria-label={`Move ${issue.label} to another folder`}
        className={inputCls}
      >
        <option value="">Move to…</option>
        {issue.parentId && <option value="__top__">Top level</option>}
        {targets
          .filter((t) => t.id !== issue.parentId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {pathLabel(pathTo(allIssues, t.id))}
            </option>
          ))}
      </select>
      <button type="button" disabled={busy} onClick={() => onSave({ active: !issue.active })} className={btn}>
        {issue.active ? "Retire" : "Restore"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="px-2.5 py-1.5 rounded-lg border border-red-300 text-sm text-red-700"
      >
        Delete
      </button>
    </li>
  );
}
