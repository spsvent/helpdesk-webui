"use client";

import { ReactNode, useEffect, useState } from "react";

// Generic public, token-authorized approval landing page shared by the form
// modules' email-approval links (/cdw/approve, /purchase/approve). The token in
// the URL authorizes the action; the app layout skips auth bootstrapping for
// these routes via the form-module manifest (see isPublicModuleRoute), so the
// ?token= can't be lost to a login redirect.
//
// Each module's approve/page.tsx is a thin wrapper providing the flow's action
// Function URL, entity wording, and a details renderer.
//
// NOTE: the built-in ticket approve page (src/app/approve/page.tsx) predates
// this generic component and keeps its own implementation.

// Fields every flow's summary entity provides (plus flow-specific extras that
// the wrapper's `renderDetails` knows how to show).
export interface TokenApprovalEntity {
  title: string;
  currentStatus: string;
  decidedBy: string | null;
  decidedDate: string | null;
}

interface Summary<E extends TokenApprovalEntity> {
  ok: boolean;
  action: "approve" | "deny" | "changes";
  decision: string;
  approverName: string;
  entity: E;
  alreadyDecided: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  approve: "Approve",
  deny: "Deny",
  changes: "Request Changes",
};

export interface TokenApprovalPageProps<E extends TokenApprovalEntity> {
  // The flow's NEXT_PUBLIC_*_ACTION_URL value ("" when unconfigured).
  actionUrl: string;
  // Long noun used in headings, e.g. "creative brief" → "Approve this creative brief?".
  entityNoun: string;
  // Short noun used in inline error copy, e.g. "brief" → "…or open the brief."
  shortNoun: string;
  // Relative in-app link for the error card (e.g. "/cdw"). Kept relative so the
  // page works on whatever host serves it.
  homeHref: string;
  // Pulls the flow's entity out of the GET summary payload (keyed "brief",
  // "request", … per flow).
  getEntity: (data: Record<string, unknown>) => E;
  // Extra detail lines rendered under the title (quick take, deadline, …).
  renderDetails?: (entity: E) => ReactNode;
  // Placeholder for the note field when the action is "changes".
  changesPlaceholder: string;
}

export default function TokenApprovalPage<E extends TokenApprovalEntity>({
  actionUrl,
  entityNoun,
  shortNoun,
  homeHref,
  getEntity,
  renderDetails,
  changesPlaceholder,
}: TokenApprovalPageProps<E>) {
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary<E> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    // Distinguish a deployment problem (action URL env unset) from a bad link.
    if (!actionUrl) {
      setError(
        "This approval page isn't configured (the approval service URL is not set). Please handle the request from the Help Desk instead."
      );
      return;
    }
    if (!t) {
      setError("This link is missing its security token.");
      return;
    }
    fetch(`${actionUrl}?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data: Record<string, unknown> & { ok: boolean; reason?: string }) => {
        if (!data.ok) {
          setError(
            data.reason === "expired" ? "This approval link has expired."
            : data.reason === "bad_signature" || data.reason === "malformed" ? "This approval link isn't valid."
            : "Unable to load this approval."
          );
          return;
        }
        setSummary({
          ok: true,
          action: data.action as Summary<E>["action"],
          decision: data.decision as string,
          approverName: data.approverName as string,
          alreadyDecided: data.alreadyDecided as boolean,
          entity: getEntity(data),
        });
      })
      .catch(() => setError("Unable to reach the approval service. Please try again."));
    // The props are constants supplied by the wrapping page — run once, like the
    // per-flow pages this component replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.reason === "already_decided") {
          setError(`This was already decided${data.decidedBy ? ` by ${data.decidedBy}` : ""}.`);
        } else if (data.reason === "not_pending") {
          // The item left the pending state without being decided (e.g. pulled
          // back for revision) — a stale emailed link must not decide it.
          setError(
            `This ${shortNoun} is no longer awaiting approval${data.currentStatus ? ` (current status: ${data.currentStatus})` : ""}.`
          );
        } else if (data.reason === "note_required") {
          setError("Please add a message describing the changes needed.");
        } else {
          setError(`Could not record your decision. Please try again or open the ${shortNoun}.`);
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
        <h1 className="text-xl font-semibold text-slate-800">
          {entityNoun.charAt(0).toUpperCase() + entityNoun.slice(1)} approval
        </h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <a href={homeHref} className="mt-4 inline-block text-brand-primary underline">Open the Help Desk</a>
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
        {ACTION_LABEL[summary.action]} this {entityNoun}?
      </h1>
      <p className="mt-1 text-slate-600">{summary.entity.title}</p>

      {summary.alreadyDecided && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          This was already {summary.entity.currentStatus.toLowerCase()}
          {summary.entity.decidedBy ? ` by ${summary.entity.decidedBy}` : ""}.
        </p>
      )}

      {renderDetails?.(summary.entity)}

      <label className="mt-5 block text-sm font-medium text-slate-700">
        {requiresNote ? "Describe the changes needed (required)" : "Optional message to the team"}
      </label>
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={requiresNote ? changesPlaceholder : "Add a note (optional)"}
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
