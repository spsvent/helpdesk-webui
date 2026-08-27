const { test } = require("node:test");
const assert = require("node:assert");
const {
  validateWebTicketInput,
  buildWebTicketFields,
  parseClientPrincipal,
} = require("./webTicketIntake");

const NOW = "2026-08-27T00:00:00.000Z";
const ACTOR = { email: "mm@skyparksantasvillage.com", name: "Mark M" };
const NO_LOOKUPS = { requesterSiteUserId: null, adminSiteUserId: null };

const validBody = {
  title: "Weed Abatement",
  description: "Cut vegetation back four feet from the wells.",
  problemType: "Facilities",
  category: "Request",
  priority: "Normal",
};

test("accepts a valid web-form payload", () => {
  const r = validateWebTicketInput(validBody);
  assert.equal(r.ok, true);
  assert.equal(r.value.problemType, "Facilities");
  assert.equal(r.value.category, "Request");
});

test("defaults category to Problem and priority to Normal", () => {
  const r = validateWebTicketInput({
    title: "t",
    description: "d",
    problemType: "Tech",
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.category, "Problem");
  assert.equal(r.value.priority, "Normal");
});

test("accepts Request tickets (the machine API path does not)", () => {
  const r = validateWebTicketInput({ ...validBody, category: "Request" });
  assert.equal(r.ok, true);
});

test("rejects a department retired in the Facilities merge", () => {
  // The regression behind ticket #607: the SharePoint column still offers this.
  const r = validateWebTicketInput({ ...validBody, problemType: "Grounds Keeping" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("problemType must be one of")));
});

test("rejects missing required fields", () => {
  const r = validateWebTicketInput({ title: "", description: "", problemType: "" });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
});

test("always stamps SupportChannel so bypassed tickets stay identifiable", () => {
  const { value } = validateWebTicketInput(validBody);
  const fields = buildWebTicketFields(value, ACTOR, NO_LOOKUPS, false, NOW);
  assert.equal(fields.SupportChannel, "Web Form");
  assert.equal(fields.Status, "New");
});

test("records the real submitter in OriginalRequester (Author is the app identity)", () => {
  const { value } = validateWebTicketInput(validBody);
  const fields = buildWebTicketFields(value, ACTOR, NO_LOOKUPS, false, NOW);
  assert.equal(fields.OriginalRequester, ACTOR.email);
});

test("non-admin Request waits at Pending", () => {
  const { value } = validateWebTicketInput({ ...validBody, category: "Request" });
  const fields = buildWebTicketFields(
    value,
    ACTOR,
    { requesterSiteUserId: 26, adminSiteUserId: null },
    false,
    NOW
  );
  assert.equal(fields.ApprovalStatus, "Pending");
  assert.equal(fields.ApprovalRequestedDate, NOW);
  assert.equal(fields.ApprovalRequestedByLookupId, 26);
  assert.ok(!("ApprovedByEmail" in fields));
});

test("admin Request is auto-approved with the approver mirrored to text columns", () => {
  const { value } = validateWebTicketInput({ ...validBody, category: "Request" });
  const fields = buildWebTicketFields(
    value,
    ACTOR,
    { requesterSiteUserId: 26, adminSiteUserId: 26 },
    true,
    NOW
  );
  assert.equal(fields.ApprovalStatus, "Approved");
  assert.equal(fields.ApprovedByEmail, ACTOR.email);
  assert.equal(fields.ApprovedByName, ACTOR.name);
  assert.equal(fields.ApprovedByLookupId, 26);
});

test("Problem tickets get no approval fields at all", () => {
  const { value } = validateWebTicketInput({ ...validBody, category: "Problem" });
  const fields = buildWebTicketFields(value, ACTOR, NO_LOOKUPS, true, NOW);
  assert.ok(!("ApprovalStatus" in fields));
  assert.ok(!("ApprovalRequestedDate" in fields));
});

test("a Request is never created with ApprovalStatus None", () => {
  // #607's signature — unreachable through the app, so it proves a direct
  // SharePoint write. Guard both admin and non-admin paths.
  for (const isAdmin of [true, false]) {
    const { value } = validateWebTicketInput({ ...validBody, category: "Request" });
    const fields = buildWebTicketFields(value, ACTOR, NO_LOOKUPS, isAdmin, NOW);
    assert.notEqual(fields.ApprovalStatus, "None");
    assert.ok(["Approved", "Pending"].includes(fields.ApprovalStatus));
  }
});

test("assignee goes to the OriginalAssignedTo text column, not a person field", () => {
  const { value } = validateWebTicketInput({
    ...validBody,
    assigneeEmail: "facilities@skyparksantasvillage.com",
  });
  const fields = buildWebTicketFields(value, ACTOR, NO_LOOKUPS, false, NOW);
  assert.equal(fields.OriginalAssignedTo, "facilities@skyparksantasvillage.com");
  assert.ok(!("AssignedToLookupId" in fields));
});

test("parses an EasyAuth principal from preferred_username", () => {
  const header = Buffer.from(
    JSON.stringify({
      claims: [
        { typ: "preferred_username", val: "mm@skyparksantasvillage.com" },
        { typ: "name", val: "Mark M" },
      ],
    })
  ).toString("base64");
  assert.deepEqual(parseClientPrincipal(header), {
    email: "mm@skyparksantasvillage.com",
    name: "Mark M",
  });
});

test("falls back to schema-URI claims and userDetails", () => {
  const header = Buffer.from(
    JSON.stringify({
      userDetails: "fallback@skyparksantasvillage.com",
      claims: [
        {
          typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
          val: "Fallback User",
        },
      ],
    })
  ).toString("base64");
  const p = parseClientPrincipal(header);
  assert.equal(p.email, "fallback@skyparksantasvillage.com");
  assert.equal(p.name, "Fallback User");
});

test("returns null for missing or malformed principal headers", () => {
  // Null forces the caller to 401 — the safe failure when EasyAuth is off.
  assert.equal(parseClientPrincipal(undefined), null);
  assert.equal(parseClientPrincipal(""), null);
  assert.equal(parseClientPrincipal("not-base64-json"), null);
  assert.equal(parseClientPrincipal(Buffer.from("{}").toString("base64")), null);
});
