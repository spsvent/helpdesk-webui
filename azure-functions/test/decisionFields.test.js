const { test } = require("node:test");
const assert = require("node:assert");
const { actionToDecision, buildDecisionFields } = require("../src/lib/decisionFields");

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
