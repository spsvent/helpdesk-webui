const { test } = require("node:test");
const assert = require("node:assert");
const { actionToDecision, buildDecisionFields, decisionConflict } = require("../src/lib/decisionFields");

test("maps actions to decisions", () => {
  assert.strictEqual(actionToDecision("approve"), "Approved");
  assert.strictEqual(actionToDecision("deny"), "Denied");
  assert.strictEqual(actionToDecision("changes"), "Changes Requested");
});

test("approve on a non-purchase ticket", () => {
  const f = buildDecisionFields("Approved", "GM", "gm@x.com", "looks good", false, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Approved");
  assert.strictEqual(f.ApprovedByName, "GM");
  assert.strictEqual(f.ApprovedByEmail, "gm@x.com");
  assert.strictEqual(f.ApprovalNotes, "looks good");
  assert.strictEqual(f.ApprovalDate, "2026-06-17T00:00:00Z");
  assert.ok(!("PurchaseStatus" in f));
});

test("approve on a purchase ticket also sets PurchaseStatus", () => {
  const f = buildDecisionFields("Approved", "GM", "gm@x.com", undefined, true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Approved");
  assert.strictEqual(f.PurchaseStatus, "Approved");
  assert.ok(!("ApprovalNotes" in f));
});

test("deny on a purchase ticket sets PurchaseStatus Denied", () => {
  const f = buildDecisionFields("Denied", "GM", "gm@x.com", "no budget", true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Denied");
  assert.strictEqual(f.PurchaseStatus, "Denied");
});

test("changes requested leaves PurchaseStatus untouched", () => {
  const f = buildDecisionFields("Changes Requested", "GM", "gm@x.com", "swap vendor", true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Changes Requested");
  assert.ok(!("PurchaseStatus" in f));
});

// --- decisionConflict: the redeem-side pending-only gate for emailed links ---

const decided = { ApprovedByName: "Jane GM", ApprovalDate: "2026-06-17T00:00:00Z" };

test("decisionConflict: a pending item may be decided (both pending vocabularies)", () => {
  assert.strictEqual(decisionConflict("Pending", "Pending", {}), null);
  assert.strictEqual(decisionConflict("Pending Approval", "Pending Approval", {}), null);
});

test("decisionConflict: terminal statuses report already_decided with attribution", () => {
  assert.deepEqual(decisionConflict("Approved", "Pending", decided), {
    reason: "already_decided",
    decidedBy: "Jane GM",
    decidedDate: "2026-06-17T00:00:00Z",
  });
  assert.strictEqual(decisionConflict("Denied", "Pending", decided).reason, "already_decided");
});

test("decisionConflict: pulled-back / never-pending items report not_pending", () => {
  // "Changes Requested" is non-terminal, but the item left the pending state — a
  // stale emailed Approve link must not decide the half-revised content.
  assert.deepEqual(decisionConflict("Changes Requested", "Pending", {}), {
    reason: "not_pending",
    currentStatus: "Changes Requested",
  });
  assert.strictEqual(decisionConflict("Draft", "Pending Approval", {}).reason, "not_pending");
  assert.strictEqual(decisionConflict("None", "Pending", {}).reason, "not_pending");
});

test("decisionConflict: a blank status normalizes to currentStatus null", () => {
  assert.deepEqual(decisionConflict(undefined, "Pending", {}), {
    reason: "not_pending",
    currentStatus: null,
  });
});

test("decisionConflict: the pending value is flow-specific, not interchangeable", () => {
  // A CDW-style status against the ticket/purchase pending value (and vice versa)
  // must NOT pass — each redeem endpoint supplies its own list's pending value.
  assert.strictEqual(decisionConflict("Pending Approval", "Pending", {}).reason, "not_pending");
  assert.strictEqual(decisionConflict("Pending", "Pending Approval", {}).reason, "not_pending");
});
