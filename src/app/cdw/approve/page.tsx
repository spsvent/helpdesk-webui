"use client";

import { useEffect, useState } from "react";

// Public, token-authorized landing for the CDW email approval links. Mirrors
// /approve but targets the CDW action Azure Function. Auth is skipped for this
// path in layout.tsx; the token authorizes the action.
const ACTION_URL = process.env.NEXT_PUBLIC_CDW_APPROVAL_ACTION_URL || "";

type Summary = {
  ok: boolean;
  action: "approve" | "deny" | "changes";
  decision: string;
  approverName: string;
  brief: {
    title: string;
    deadline: string | null;
    projectManager: string | null;
    quickTake: string | null;
    currentStatus: string;
    decidedBy: string | null;
    decidedDate: string | null;
  };
  alreadyDecided: boolean;
};

const ACTION_LABEL: Record<string, string> = {
  approve: "Approve",
  deny: "Deny",
  changes: "Request Changes",
};

export default function CdwApprovePage() {
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
    if (!t || !ACTION_URL) {
      setError("This link is missing its security token.");
      return;
    }
    fetch(`${ACTION_URL}?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data: Summary & { reason?: string }) => {
        if (!data.ok) {
          setError(
            data.reason === "expired" ? "This approval link has expired."
            : data.reason === "bad_signature" || data.reason === "malformed" ? "This approval link isn't valid."
            : "Unable to load this approval."
          );
          return;
        }
        setSummary(data);
      })
      .catch(() => setError("Unable to reach the approval service. Please try again."));
  }, []);

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.reason === "already_decided") {
          setError(`This was already decided${data.decidedBy ? ` by ${data.decidedBy}` : ""}.`);
        } else if (data.reason === "note_required") {
          setError("Please add a message describing the changes needed.");
        } else {
          setError("Could not record your decision. Please try again or open the brief.");
        }
        return;
      }
      setDone(data.decision);
    } catch {
      setError("Could not record your decision. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const card = "max-w-md w-full bg-white rounded-2xl shadow-lg p-8";
  const wrap = "min-h-screen flex items-center justify-center bg-slate-100 p-4";

  if (done) {
    return (
      <div className={wrap}><div className={card}>
        <h1 className="text-2xl font-semibold text-emerald-600">✓ {done}</h1>
        <p className="mt-2 text-slate-600">Your decision has been recorded. You can close this tab.</p>
      </div></div>
    );
  }

  if (error && !summary) {
    return (
      <div className={wrap}><div className={card}>
        <h1 className="text-xl font-semibold text-slate-800">Creative brief approval</h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <a href="https://tickets.spsvent.net/cdw" className="mt-4 inline-block text-brand-primary underline">Open the Help Desk</a>
      </div></div>
    );
  }

  if (!summary) {
    return <div className={wrap}><div className={card}><p className="text-slate-500">Loading…</p></div></div>;
  }

  const requiresNote = summary.action === "changes";

  return (
    <div className={wrap}><div className={card}>
      <h1 className="text-2xl font-semibold text-slate-800">
        {ACTION_LABEL[summary.action]} this creative brief?
      </h1>
      <p className="mt-1 text-slate-600">{summary.brief.title}</p>

      {summary.alreadyDecided && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          This was already {summary.brief.currentStatus.toLowerCase()}
          {summary.brief.decidedBy ? ` by ${summary.brief.decidedBy}` : ""}.
        </p>
      )}

      {summary.brief.quickTake && (
        <p className="mt-3 text-sm text-slate-500">
          <span className="font-medium text-slate-700">Quick take:</span> {summary.brief.quickTake}
        </p>
      )}
      {summary.brief.deadline && (
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-medium text-slate-700">Deadline:</span> {summary.brief.deadline}
        </p>
      )}

      <label className="mt-5 block text-sm font-medium text-slate-700">
        {requiresNote ? "Describe the changes needed (required)" : "Optional message to the team"}
      </label>
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={requiresNote ? "e.g. Please tighten the call to action" : "Add a note (optional)"}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || summary.alreadyDecided || (requiresNote && !note.trim())}
        className="mt-5 w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Recording…" : `Confirm ${ACTION_LABEL[summary.action]}`}
      </button>
    </div></div>
  );
}
