import { describe, it, expect } from "vitest";
import {
  DecisionConflictError,
  decisionConflict,
  decisionConflictMessage,
  guardedDecisionPatch,
  isTerminalDecisionStatus,
  type DecisionReadResult,
} from "./decisionConflict";

describe("isTerminalDecisionStatus", () => {
  it("Approved and Denied are terminal", () => {
    expect(isTerminalDecisionStatus("Approved")).toBe(true);
    expect(isTerminalDecisionStatus("Denied")).toBe(true);
  });
  it("pending / bounced / draft states are not", () => {
    for (const s of ["Pending", "Pending Approval", "Changes Requested", "Draft", "None"]) {
      expect(isTerminalDecisionStatus(s)).toBe(false);
    }
  });
});

describe("decisionConflict (pending-only gate — mirror of the Azure Function's)", () => {
  it("allows the decision while the item is pending", () => {
    expect(decisionConflict("Pending", "Pending")).toBeNull();
    expect(decisionConflict("Pending Approval", "Pending Approval")).toBeNull();
  });
  it("terminal status → already_decided with attribution", () => {
    const err = decisionConflict("Approved", "Pending", "Pat GM");
    expect(err).toBeInstanceOf(DecisionConflictError);
    expect(err!.reason).toBe("already_decided");
    expect(err!.currentStatus).toBe("Approved");
    expect(err!.decidedBy).toBe("Pat GM");
  });
  it("non-terminal, non-pending status → not_pending (pulled back for revision)", () => {
    const err = decisionConflict("Changes Requested", "Pending Approval");
    expect(err!.reason).toBe("not_pending");
    expect(err!.currentStatus).toBe("Changes Requested");
  });
});

describe("decisionConflictMessage", () => {
  it("already_decided names the decider, distinct from the generic failure copy", () => {
    const msg = decisionConflictMessage(new DecisionConflictError("already_decided", "Denied", "Pat GM"), "brief");
    expect(msg).toContain("already decided by Pat GM");
    expect(msg).toContain("brief");
  });
  it("not_pending tells the user to refresh", () => {
    const msg = decisionConflictMessage(new DecisionConflictError("not_pending", "Draft"), "request");
    expect(msg).toContain("no longer awaiting approval");
    expect(msg).toContain("Refresh");
  });
  it("conflict_retry asks to retry after a refresh", () => {
    const msg = decisionConflictMessage(new DecisionConflictError("conflict_retry", "Pending"));
    expect(msg).toContain("Refresh and try again");
  });
});

// --- guardedDecisionPatch (read → gate → If-Match PATCH with the bounded 412 loop)

function reader(...states: DecisionReadResult[]) {
  let i = 0;
  const calls: number[] = [];
  return {
    calls,
    read: async () => {
      calls.push(i);
      return states[Math.min(i++, states.length - 1)];
    },
  };
}

function http412() {
  return Object.assign(new Error("Precondition Failed"), { statusCode: 412 });
}

describe("guardedDecisionPatch", () => {
  it("happy path: patches once with the freshly read ETag", async () => {
    const r = reader({ status: "Pending", etag: "etag-1" });
    const patched: string[] = [];
    await guardedDecisionPatch({
      read: r.read,
      patch: async (etag) => { patched.push(etag); },
      pendingStatus: "Pending",
    });
    expect(patched).toEqual(["etag-1"]);
  });

  it("throws already_decided without patching when the item was decided elsewhere", async () => {
    const r = reader({ status: "Approved", decidedBy: "Pat GM", etag: "etag-1" });
    let patched = 0;
    await expect(
      guardedDecisionPatch({
        read: r.read,
        patch: async () => { patched++; },
        pendingStatus: "Pending",
      })
    ).rejects.toMatchObject({ reason: "already_decided", decidedBy: "Pat GM" });
    expect(patched).toBe(0);
  });

  it("412 with the item still pending → retries once with the fresh ETag", async () => {
    const r = reader({ status: "Pending", etag: "etag-1" }, { status: "Pending", etag: "etag-2" });
    const patched: string[] = [];
    await guardedDecisionPatch({
      read: r.read,
      patch: async (etag) => {
        patched.push(etag);
        if (etag === "etag-1") throw http412();
      },
      pendingStatus: "Pending",
    });
    expect(patched).toEqual(["etag-1", "etag-2"]);
  });

  it("412 caused by a concurrent decision → conflict, no blind retry", async () => {
    const r = reader(
      { status: "Pending Approval", etag: "etag-1" },
      { status: "Denied", decidedBy: "Other GM", etag: "etag-2" }
    );
    const patched: string[] = [];
    await expect(
      guardedDecisionPatch({
        read: r.read,
        patch: async (etag) => { patched.push(etag); throw http412(); },
        pendingStatus: "Pending Approval",
      })
    ).rejects.toMatchObject({ reason: "already_decided", decidedBy: "Other GM" });
    expect(patched).toEqual(["etag-1"]); // gave up after the gate, no second PATCH
  });

  it("repeated 412s while still pending → bounded conflict_retry (mirrors the Function's loop)", async () => {
    const r = reader(
      { status: "Pending", etag: "etag-1" },
      { status: "Pending", etag: "etag-2" },
      { status: "Pending", etag: "etag-3" }
    );
    const patched: string[] = [];
    await expect(
      guardedDecisionPatch({
        read: r.read,
        patch: async (etag) => { patched.push(etag); throw http412(); },
        pendingStatus: "Pending",
      })
    ).rejects.toMatchObject({ reason: "conflict_retry" });
    expect(patched).toEqual(["etag-1", "etag-2"]); // exactly one retry
  });

  it("non-412 errors pass through untouched", async () => {
    const r = reader({ status: "Pending", etag: "etag-1" });
    const boom = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await expect(
      guardedDecisionPatch({
        read: r.read,
        patch: async () => { throw boom; },
        pendingStatus: "Pending",
      })
    ).rejects.toBe(boom);
    expect(r.calls.length).toBe(1); // no conflict re-read for unrelated failures
  });
});
