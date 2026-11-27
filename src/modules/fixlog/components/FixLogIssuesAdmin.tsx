"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import LoadingSpinner from "@/components/LoadingSpinner";
import { getProblemTypeSubs } from "@/lib/categoryConfig";
import { FIXLOG_DEPARTMENT, type FixLogIssue, type FixLogIssueWritable } from "../types";
import { nextSortOrder, sortIssues } from "../fixLog";
import { createIssue, deleteIssue, isFixLogIssuesConfigured, listIssues, updateIssue } from "../fixLogService";

// Category choices = the Tech sub-categories used on tickets, so fixes and
// tickets group the same way.
const CATEGORIES = getProblemTypeSubs(FIXLOG_DEPARTMENT);

const inputCls = "px-2 py-1.5 border border-border rounded-lg bg-bg-card text-text-primary text-sm";

// Add / rename / recategorise / reorder / retire the quick-pick issue buttons.
// Open to everyone who can use the log (IT + admins).
export default function FixLogIssuesAdmin() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [issues, setIssues] = useState<FixLogIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setIssues(sortIssues(await listIssues(getGraphClient(instance, account), { includeInactive: true })));
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

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      console.error("[FixLogIssuesAdmin] save failed:", e);
      setError("Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  }

  const client = () => getGraphClient(instance, account!);

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    if (issues.some((i) => i.label.toLowerCase() === label.toLowerCase())) {
      setError("That issue already exists.");
      return;
    }
    act(async () => {
      await createIssue(client(), {
        label,
        category: newCategory,
        sortOrder: nextSortOrder(issues),
        active: true,
        department: FIXLOG_DEPARTMENT,
      });
      setNewLabel("");
      setNewCategory("");
    });
  }

  // Swap with the neighbour. Re-spaces the pair if they share a SortOrder.
  function move(index: number, dir: -1 | 1) {
    const a = issues[index];
    const b = issues[index + dir];
    if (!a || !b) return;
    const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + dir : b.sortOrder;
    act(async () => {
      await updateIssue(client(), a.id, { sortOrder: aOrder });
      await updateIssue(client(), b.id, { sortOrder: a.sortOrder });
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
          These are the quick-pick buttons on the fix form. Retire an issue to hide its button without
          affecting fixes already logged with it.
        </p>
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={255}
          placeholder="New issue, e.g. Receipt printer jammed"
          className={`${inputCls} flex-1 min-w-[12rem]`}
        />
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={inputCls}>
          <option value="">No category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={busy || !newLabel.trim()}
          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl bg-bg-card">
          {issues.map((issue, i) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              first={i === 0}
              last={i === issues.length - 1}
              busy={busy}
              onMove={(dir) => move(i, dir)}
              onSave={(patch) => act(() => updateIssue(client(), issue.id, patch))}
              onDelete={() => {
                if (
                  window.confirm(
                    `Delete "${issue.label}"? Fixes already logged keep their issue text. Retire it instead to just hide the button.`
                  )
                )
                  act(() => deleteIssue(client(), issue.id));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  first,
  last,
  busy,
  onMove,
  onSave,
  onDelete,
}: {
  issue: FixLogIssue;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: FixLogIssueWritable) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(issue.label);
  const [category, setCategory] = useState(issue.category || "");
  useEffect(() => {
    setLabel(issue.label);
    setCategory(issue.category || "");
  }, [issue.label, issue.category]);
  const dirty = label.trim() !== issue.label || category !== (issue.category || "");
  const arrow = "w-7 h-7 rounded border border-border text-text-secondary disabled:opacity-30";

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
        maxLength={255}
        className={`${inputCls} flex-1 min-w-[10rem]`}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
        <option value="">No category</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {dirty && (
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={() => onSave({ label: label.trim(), category })}
          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm disabled:opacity-50"
        >
          Save
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onSave({ active: !issue.active })}
        className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-primary"
      >
        {issue.active ? "Retire" : "Restore"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-700"
      >
        Delete
      </button>
    </li>
  );
}
