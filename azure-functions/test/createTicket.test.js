const { test } = require("node:test");
const assert = require("node:assert");
const {
  validateCreateTicketInput,
  isOpenStatus,
  findOpenDuplicate,
  isRepeatCommentThrottled,
} = require("../src/lib/ticketIntake");
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

// ---- repeat-comment throttle ----

const NOW = Date.parse("2026-08-06T12:00:00Z");
const at = (minsAgo, extra) => ({
  fields: { Body: "Repeat alert from uptime-kuma (ref kuma-16):\nDOWN", Created: new Date(NOW - minsAgo * 60000).toISOString(), ...extra },
});

test("isRepeatCommentThrottled suppresses a repeat inside the window", () => {
  assert.strictEqual(isRepeatCommentThrottled([at(5)], NOW, 30), true);
  assert.strictEqual(isRepeatCommentThrottled([at(29.5)], NOW, 30), true);
});

test("isRepeatCommentThrottled allows a repeat once the window has passed", () => {
  assert.strictEqual(isRepeatCommentThrottled([at(31)], NOW, 30), false);
  assert.strictEqual(isRepeatCommentThrottled([at(240)], NOW, 30), false);
});

test("isRepeatCommentThrottled only counts repeat-alert comments", () => {
  const human = { fields: { Body: "Rebooted the switch", Created: new Date(NOW - 60000).toISOString() } };
  assert.strictEqual(isRepeatCommentThrottled([human], NOW, 30), false);
  // the original description comment posted at ticket creation must not throttle
  const original = { fields: { Body: "Uptime Kuma detected X is DOWN.", Created: new Date(NOW - 60000).toISOString() } };
  assert.strictEqual(isRepeatCommentThrottled([original], NOW, 30), false);
});

test("isRepeatCommentThrottled falls back to the item-level createdDateTime", () => {
  const item = { createdDateTime: new Date(NOW - 60000).toISOString(), fields: { Body: "Repeat alert (ref kuma-16):" } };
  assert.strictEqual(isRepeatCommentThrottled([item], NOW, 30), true);
});

test("isRepeatCommentThrottled fails open on missing/unparseable timestamps", () => {
  assert.strictEqual(isRepeatCommentThrottled([{ fields: { Body: "Repeat alert x" } }], NOW, 30), false);
  assert.strictEqual(isRepeatCommentThrottled([{ fields: { Body: "Repeat alert x", Created: "nonsense" } }], NOW, 30), false);
});

test("isRepeatCommentThrottled scans all comments, not just the newest", () => {
  assert.strictEqual(isRepeatCommentThrottled([at(400), at(300), at(2)], NOW, 30), true);
});

test("a zero/absent throttle disables suppression entirely", () => {
  assert.strictEqual(isRepeatCommentThrottled([at(1)], NOW, 0), false);
  assert.strictEqual(isRepeatCommentThrottled([at(1)], NOW, undefined), false);
});

test("isRepeatCommentThrottled handles an empty/missing comment list", () => {
  assert.strictEqual(isRepeatCommentThrottled([], NOW, 30), false);
  assert.strictEqual(isRepeatCommentThrottled(undefined, NOW, 30), false);
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
