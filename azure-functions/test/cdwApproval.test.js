const { test } = require("node:test");
const assert = require("node:assert");
const { buildCdwDecisionFields, cdwDecisionRecipients } = require("../src/lib/cdwDecisionFields");
const { signToken, verifyToken } = require("../src/lib/approvalToken");

test("buildCdwDecisionFields sets CdwStatus + approver + date; notes optional", () => {
  const f = buildCdwDecisionFields("Approved", "Jane GM", "jane@x.com", undefined, "2026-06-26T00:00:00Z");
  assert.equal(f.CdwStatus, "Approved");
  assert.equal(f.ApprovedByName, "Jane GM");
  assert.equal(f.ApprovedByEmail, "jane@x.com");
  assert.equal(f.ApprovalDate, "2026-06-26T00:00:00Z");
  assert.ok(!("ApprovalNotes" in f));

  const g = buildCdwDecisionFields("Changes Requested", "Jane", "jane@x.com", "tighten the CTA", "t");
  assert.equal(g.CdwStatus, "Changes Requested");
  assert.equal(g.ApprovalNotes, "tighten the CTA");
});

test("cdwDecisionRecipients: approved → final + requester, deduped, approver excluded", () => {
  assert.deepEqual(
    cdwDecisionRecipients({ FinalRecipientEmail: "designer@x.com", RequesterEmail: "pm@x.com" }, "Approved", "gm@x.com"),
    ["designer@x.com", "pm@x.com"]
  );
  // requester == final recipient → deduped (case-insensitive)
  assert.deepEqual(
    cdwDecisionRecipients({ FinalRecipientEmail: "a@x.com", RequesterEmail: "A@x.com" }, "Approved", "gm@x.com"),
    ["a@x.com"]
  );
  // the approver is never emailed their own decision
  assert.deepEqual(
    cdwDecisionRecipients({ FinalRecipientEmail: "gm@x.com", RequesterEmail: "pm@x.com" }, "Approved", "GM@x.com"),
    ["pm@x.com"]
  );
});

test("cdwDecisionRecipients: denied / changes → requester only", () => {
  const fields = { FinalRecipientEmail: "designer@x.com", RequesterEmail: "pm@x.com" };
  assert.deepEqual(cdwDecisionRecipients(fields, "Denied", "gm@x.com"), ["pm@x.com"]);
  assert.deepEqual(cdwDecisionRecipients(fields, "Changes Requested", "gm@x.com"), ["pm@x.com"]);
});

test("approval token round-trips the kind tag (cdw vs untagged ticket)", () => {
  process.env.APPROVAL_LINK_SECRET = "test-secret";
  const cdwTok = signToken({ tid: "5", action: "approve", email: "gm@x.com", name: "GM", kind: "cdw" });
  const cdwRes = verifyToken(cdwTok);
  assert.equal(cdwRes.valid, true);
  assert.equal(cdwRes.payload.kind, "cdw");

  // A ticket token carries no kind tag.
  const ticketTok = signToken({ tid: "9", action: "deny", email: "gm@x.com", name: "GM" });
  assert.equal(verifyToken(ticketTok).payload.kind, undefined);
});
