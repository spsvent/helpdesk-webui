const { test } = require("node:test");
const assert = require("node:assert");
const { buildPurchaseDecisionFields, purchaseDecisionRecipients } = require("../src/lib/purchaseDecisionFields");
const { signToken, verifyToken } = require("../src/lib/approvalToken");

test("buildPurchaseDecisionFields writes both approval gate + fulfillment status", () => {
  const a = buildPurchaseDecisionFields("Approved", "GM", "gm@x.com", undefined, "2026-07-01T00:00:00Z");
  assert.equal(a.ApprovalStatus, "Approved");
  assert.equal(a.PurchaseStatus, "Approved");
  assert.equal(a.ApprovedByEmail, "gm@x.com");
  assert.ok(!("ApprovalNotes" in a));

  const d = buildPurchaseDecisionFields("Denied", "GM", "gm@x.com", "no budget", "t");
  assert.equal(d.ApprovalStatus, "Denied");
  assert.equal(d.PurchaseStatus, "Denied");
  assert.equal(d.ApprovalNotes, "no budget");

  // "Changes Requested" leaves PurchaseStatus untouched.
  const c = buildPurchaseDecisionFields("Changes Requested", "GM", "gm@x.com", "cheaper vendor", "t");
  assert.equal(c.ApprovalStatus, "Changes Requested");
  assert.ok(!("PurchaseStatus" in c));
});

test("purchaseDecisionRecipients: requester + participants, approver excluded, deduped", () => {
  assert.deepEqual(
    purchaseDecisionRecipients({ RequesterEmail: "buyer@x.com", ParticipantEmails: "a@x.com; buyer@x.com" }, "gm@x.com"),
    ["buyer@x.com", "a@x.com"]
  );
  assert.deepEqual(
    purchaseDecisionRecipients({ RequesterEmail: "gm@x.com" }, "GM@x.com"),
    []
  );
});

test("purchase tokens carry kind:'purchase'", () => {
  process.env.APPROVAL_LINK_SECRET = "test-secret";
  const tok = signToken({ tid: "7", action: "approve", email: "gm@x.com", name: "GM", kind: "purchase" });
  const res = verifyToken(tok);
  assert.equal(res.valid, true);
  assert.equal(res.payload.kind, "purchase");
});
