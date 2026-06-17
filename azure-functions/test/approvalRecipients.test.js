const { test } = require("node:test");
const assert = require("node:assert");
const { resolveDecisionRecipients } = require("../src/lib/approvalRecipients");

test("unions requester, assignee, approval-requester, participants and commenters; excludes approver", () => {
  const fields = {
    RequesterEmail: "req@x.com",
    OriginalAssignedTo: "assignee@x.com",
    ApprovalRequestedByEmail: "asker@x.com",
    ParticipantEmails: "vendor@x.com; extra@x.com",
  };
  const commenterEmails = ["tom@x.com", "req@x.com"];
  const recipients = resolveDecisionRecipients(fields, commenterEmails, "assignee@x.com");
  assert.deepStrictEqual(
    [...recipients].sort(),
    ["asker@x.com", "extra@x.com", "req@x.com", "tom@x.com", "vendor@x.com"].sort()
  );
  assert.ok(!recipients.includes("assignee@x.com"));
});

test("dedupes case-insensitively and ignores blanks", () => {
  const fields = { RequesterEmail: "Req@X.com", ParticipantEmails: "req@x.com;; ,  " };
  const recipients = resolveDecisionRecipients(fields, [], "");
  assert.deepStrictEqual(recipients, ["req@x.com"]);
});
