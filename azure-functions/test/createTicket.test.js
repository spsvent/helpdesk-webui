const { test } = require("node:test");
const assert = require("node:assert");
const { validateCreateTicketInput, isOpenStatus, findOpenDuplicate } = require("../src/lib/ticketIntake");
const { parseAutoAssignRules, findAssignee } = require("../src/lib/autoAssign");

// ---- validateCreateTicketInput ----

test("accepts a minimal valid Problem ticket and applies defaults", () => {
  const { ok, errors, value } = validateCreateTicketInput({
    title: " Printer offline ",
    description: "unreachable 5m",
    problemType: "Tech",
  });
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(value.title, "Printer offline"); // trimmed
  assert.strictEqual(value.category, "Problem");
  assert.strictEqual(value.priority, "Normal"); // default
});

test("requires title, description, problemType", () => {
  const { ok, errors } = validateCreateTicketInput({});
  assert.strictEqual(ok, false);
  assert.ok(errors.includes("title is required"));
  assert.ok(errors.includes("description is required"));
  assert.ok(errors.includes("problemType is required"));
});

test("rejects Request category (v1 = Problem only)", () => {
  const { ok, errors } = validateCreateTicketInput({
    title: "x", description: "y", problemType: "Tech", category: "Request",
  });
  assert.strictEqual(ok, false);
  assert.ok(errors.some((e) => e.includes("category must be 'Problem'")));
});

test("rejects an unknown problemType (drives routing)", () => {
  const { ok, errors } = validateCreateTicketInput({
    title: "x", description: "y", problemType: "Plumbing",
  });
  assert.strictEqual(ok, false);
  assert.ok(errors.some((e) => e.includes("problemType must be one of")));
});

test("accepts Facilities (post-merge department, not in stale SharePoint choices)", () => {
  const { ok } = validateCreateTicketInput({ title: "x", description: "y", problemType: "Facilities" });
  assert.strictEqual(ok, true);
});

test("accepts the full current department set (synced with categoryConfig)", () => {
  for (const problemType of ["Customer Service", "Finance", "Food & Beverage", "Campground", "Retail"]) {
    const { ok } = validateCreateTicketInput({ title: "x", description: "y", problemType });
    assert.strictEqual(ok, true, `${problemType} should be accepted`);
  }
});

test("rejects an unknown priority", () => {
  const { ok, errors } = validateCreateTicketInput({
    title: "x", description: "y", problemType: "Tech", priority: "Critical",
  });
  assert.strictEqual(ok, false);
  assert.ok(errors.some((e) => e.includes("priority must be one of")));
});

test("passes through optional fields", () => {
  const { value } = validateCreateTicketInput({
    title: "x", description: "y", problemType: "Tech", priority: "High",
    problemTypeSub: "Audio", location: "Admin Office", requesterEmail: "a@b.com",
    assigneeEmail: "itav@b.com", source: "uptime-kuma", externalRef: "kuma-1",
  });
  assert.strictEqual(value.priority, "High");
  assert.strictEqual(value.problemTypeSub, "Audio");
  assert.strictEqual(value.location, "Admin Office");
  assert.strictEqual(value.source, "uptime-kuma");
  assert.strictEqual(value.externalRef, "kuma-1");
});

test("tolerates a non-object body", () => {
  const { ok } = validateCreateTicketInput(null);
  assert.strictEqual(ok, false);
});

// ---- dedup ----

test("isOpenStatus treats Resolved/Closed/Cancelled as closed", () => {
  assert.strictEqual(isOpenStatus("New"), true);
  assert.strictEqual(isOpenStatus("In Progress"), true);
  assert.strictEqual(isOpenStatus("Resolved"), false);
  assert.strictEqual(isOpenStatus("Closed"), false);
});

test("findOpenDuplicate returns the open ticket sharing an externalRef", () => {
  const items = [
    { id: "10", fields: { ExternalRef: "kuma-1", Status: "Closed" } },
    { id: "20", fields: { ExternalRef: "kuma-1", Status: "New" } },
    { id: "30", fields: { ExternalRef: "other", Status: "New" } },
  ];
  assert.strictEqual(findOpenDuplicate(items, "kuma-1").id, "20");
});

test("findOpenDuplicate returns null when every match is closed", () => {
  const items = [{ id: "10", fields: { ExternalRef: "kuma-1", Status: "Resolved" } }];
  assert.strictEqual(findOpenDuplicate(items, "kuma-1"), null);
});

test("findOpenDuplicate returns null without an externalRef", () => {
  assert.strictEqual(findOpenDuplicate([{ id: "1", fields: { Status: "New" } }], ""), null);
});

// ---- auto-assign ----

const RULES = [
  { fields: { Department: "Tech", SubCategory: "POS", AssignToEmail: "pos@x.com", SortOrder: 10 } },
  { fields: { Department: "Tech", AssignToEmail: "itav@x.com", SortOrder: 20 } },
  { fields: { Department: "Operations", AssignToEmail: "ops@x.com", SortOrder: 20 } },
  { fields: { Department: "Tech", AssignToEmail: "inactive@x.com", SortOrder: 5, IsActive: false } },
  { fields: { AssignToEmail: "", SortOrder: 1 } }, // no email → dropped
];

test("parseAutoAssignRules drops inactive/emailless rules and sorts by SortOrder", () => {
  const rules = parseAutoAssignRules(RULES);
  assert.deepStrictEqual(rules.map((r) => r.assignToEmail), ["pos@x.com", "itav@x.com", "ops@x.com"]);
});

test("findAssignee picks the most specific matching rule first", () => {
  const rules = parseAutoAssignRules(RULES);
  assert.strictEqual(findAssignee(rules, { problemType: "Tech", problemTypeSub: "POS" }), "pos@x.com");
  assert.strictEqual(findAssignee(rules, { problemType: "Tech", problemTypeSub: "IT" }), "itav@x.com");
  assert.strictEqual(findAssignee(rules, { problemType: "Operations" }), "ops@x.com");
});

test("findAssignee returns null when nothing matches", () => {
  const rules = parseAutoAssignRules(RULES);
  assert.strictEqual(findAssignee(rules, { problemType: "Marketing" }), null);
});
