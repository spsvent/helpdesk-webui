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
// APPROVE IS ONE CLICK. The "Approve" button in the email lands here and the
// decision is submitted automatically once the summary loads — the approver does
// NOT have to tap a second Confirm button. That second tap was silently losing
// approvals: on a phone, against a cold-start Function (4–5s), approvers read the
// summary, assumed the emailed click had approved it, and closed the tab. The
// record stayed Pending and only the daily reminder noticed.
//
// Auto-submitting is safe from link-prefetching email scanners: the POST is made
// by this component's JavaScript, and scanners fetch the URL without executing a
// SPA. Deny and Request Changes still require an explicit tap — they're
// destructive / need a note, so a mis-tap must not be irreversible.
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
  // The summary fetch failed in a way that's worth retrying (network/timeout) —
  // as opposed to a bad or expired token, where retrying can't help.
  const [loadFailed, setLoadFailed] = useState(false);
  // Auto-submitting an emailed Approve: the summary is loaded and the decision is
  // in flight without the approver doing anything.
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // The Function runs on a Flex Consumption plan, so a cold start can take
  // several seconds. Bound the wait so a hung request surfaces a retry instead of
  // leaving the approver on "Loading…" forever (which is how approvals were lost).
  const FETCH_TIMEOUT_MS = 20000;

  async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const submit = async (activeToken: string | null, noteText: string) => {
    if (!activeToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: activeToken, note: noteText }),
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

  // Load the side-effect-free summary, then (for Approve) record the decision
  // straight away. One network hiccup is retried automatically; after that the
  // approver gets an explicit failure and a Try again button — never a silent hang.
  const loadSummary = async (activeToken: string, attempt = 0): Promise<void> => {
    setError(null);
    setLoadFailed(false);
    try {
      const res = await fetchWithTimeout(`${actionUrl}?token=${encodeURIComponent(activeToken)}`);
      const data: Record<string, unknown> & { ok: boolean; reason?: string } = await res.json();
      if (!data.ok) {
        // A rejected token is terminal — retrying can't change the answer.
        setError(
          data.reason === "expired" ? "This approval link has expired."
          : data.reason === "bad_signature" || data.reason === "malformed" ? "This approval link isn't valid."
          : "Unable to load this approval."
        );
        return;
      }
      const loaded: Summary<E> = {
        ok: true,
        action: data.action as Summary<E>["action"],
        decision: data.decision as string,
        approverName: data.approverName as string,
        alreadyDecided: data.alreadyDecided as boolean,
        entity: getEntity(data),
      };
      setSummary(loaded);
      if (loaded.action === "approve" && !loaded.alreadyDecided) {
        setAutoSubmitting(true);
        // No note on the one-click path; the approver never saw the note field.
        await submit(activeToken, "");
        setAutoSubmitting(false);
      }
    } catch {
      if (attempt < 1) {
        await loadSummary(activeToken, attempt + 1);
        return;
      }
      setError("Couldn't reach the approval service. Your decision has NOT been recorded yet.");
      setLoadFailed(true);
    }
  };

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
    loadSummary(t);
    // The props are constants supplied by the wrapping page — run once, like the
    // per-flow pages this component replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {loadFailed && token && (
          <button
            onClick={() => loadSummary(token)}
            className="mt-4 w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white"
          >
            Try again
          </button>
        )}
        <a href={homeHref} className="mt-4 inline-block text-brand-primary underline">Open the Help Desk</a>
      </div></div>
    );
  }

  if (!summary) {
    return (
      <div className={wrap}><div className={card}>
        <p className="text-slate-500">Loading…</p>
        <p className="mt-2 text-sm text-slate-400">
          This can take a few seconds. Keep this page open until it confirms your decision.
        </p>
      </div></div>
    );
  }

  // One-click approve is in flight — say so plainly, so nobody closes the tab
  // believing the emailed click already did it.
  if (autoSubmitting) {
    return (
      <div className={wrap}><div className={card}>
        <h1 className="text-xl font-semibold text-slate-800">Recording your approval…</h1>
        <p className="mt-2 text-slate-600">{summary.entity.title}</p>
        <p className="mt-3 text-sm text-slate-400">Please keep this page open for a moment.</p>
      </div></div>
    );
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

      {/* The one-click approve was attempted and didn't land. Make the failure
          loud — the whole bug was approvers leaving without knowing. */}
      {summary.action === "approve" && !summary.alreadyDecided && error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
          Your approval has NOT been recorded. Use the button below to try again.
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
        onClick={() => submit(token, note)}
        disabled={submitting || summary.alreadyDecided || (requiresNote && !note.trim())}
        className="mt-5 w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Recording…" : `Confirm ${ACTION_LABEL[summary.action]}`}
      </button>
    </div></div>
  );
}
