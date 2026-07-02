// Concurrency guard for IN-APP approval decisions (purchase + CDW).
//
// Frontend mirror of the emailed-link path in azure-functions/src/lib/decisionFields.js
// (decisionConflict) and the If-Match retry loop in the *ApprovalAction handlers:
// a decision may only land while the item is still in its pending status, and the
// PATCH is conditioned on the ETag read moments before — so a GM with a stale tab
// can't silently overwrite a decision already made by email or by another GM.

export type DecisionConflictReason = "already_decided" | "not_pending" | "conflict_retry";

// Thrown instead of writing when the item is no longer awaiting approval (or when
// concurrent writes exhaust the bounded retry). Panels catch this specifically and
// show a distinct "already decided by X / refresh" notice instead of the generic
// "try again" failure.
export class DecisionConflictError extends Error {
  readonly reason: DecisionConflictReason;
  readonly currentStatus: string;
  readonly decidedBy?: string;

  constructor(reason: DecisionConflictReason, currentStatus: string, decidedBy?: string) {
    super(`decision conflict (${reason}): status is "${currentStatus}"`);
    this.name = "DecisionConflictError";
    this.reason = reason;
    this.currentStatus = currentStatus;
    this.decidedBy = decidedBy;
  }
}

// Terminal decisions lock the item ("Changes Requested" is non-terminal). The same
// two values are terminal for the purchase ApprovalStatus and the CDW status.
export function isTerminalDecisionStatus(status: string): boolean {
  return status === "Approved" || status === "Denied";
}

// Pure gate (mirror of the Function's decisionConflict): null when the decision may
// proceed, otherwise the typed error to throw. `pendingStatus` differs per flow
// ("Pending" for purchases' ApprovalStatus, "Pending Approval" for CDW status).
export function decisionConflict(
  currentStatus: string,
  pendingStatus: string,
  decidedBy?: string
): DecisionConflictError | null {
  if (isTerminalDecisionStatus(currentStatus)) {
    return new DecisionConflictError("already_decided", currentStatus, decidedBy);
  }
  if (currentStatus !== pendingStatus) {
    return new DecisionConflictError("not_pending", currentStatus);
  }
  return null;
}

// Human message for the panels — distinct from the generic failure copy.
export function decisionConflictMessage(err: DecisionConflictError, noun = "request"): string {
  if (err.reason === "already_decided") {
    const by = err.decidedBy ? ` by ${err.decidedBy}` : "";
    return `This ${noun} was already decided${by} (${err.currentStatus}).`;
  }
  if (err.reason === "not_pending") {
    return `This ${noun} is no longer awaiting approval (status: ${err.currentStatus || "unknown"}). Refresh to see its current state.`;
  }
  return `This ${noun} is being updated by someone else right now. Refresh and try again.`;
}

// A fresh read of the decision target: its gate status, who decided it (for the
// conflict message), and the ETag to condition the write on.
export interface DecisionReadResult {
  status: string;
  decidedBy?: string;
  etag: string;
}

function isPreconditionFailed(e: unknown): boolean {
  const code = (e as { statusCode?: unknown; status?: unknown }) || {};
  return code.statusCode === 412 || code.status === 412;
}

// Read → pending gate → PATCH with If-Match, with the Function's bounded 412 loop:
// on a 412, re-read once — if no longer pending throw the conflict, if still pending
// (an unrelated field changed) retry the PATCH once against the fresh ETag, then
// give up with "conflict_retry".
export async function guardedDecisionPatch(opts: {
  read: () => Promise<DecisionReadResult>;
  patch: (etag: string) => Promise<void>;
  pendingStatus: string;
}): Promise<void> {
  const first = await opts.read();
  const gate = decisionConflict(first.status, opts.pendingStatus, first.decidedBy);
  if (gate) throw gate;

  let etag = first.etag;
  for (let attempt = 0; ; attempt++) {
    try {
      await opts.patch(etag);
      return;
    } catch (e) {
      if (!isPreconditionFailed(e)) throw e;
      const fresh = await opts.read();
      const freshGate = decisionConflict(fresh.status, opts.pendingStatus, fresh.decidedBy);
      if (freshGate) throw freshGate;
      if (attempt >= 1) throw new DecisionConflictError("conflict_retry", fresh.status);
      etag = fresh.etag;
    }
  }
}
