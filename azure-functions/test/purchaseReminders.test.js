const test = require("node:test");
const assert = require("node:assert");
const {
  reminderPlan,
  shouldSend,
  inNeedByWindow,
  receiveDue,
  DAY_MS,
} = require("../src/lib/purchaseReminderLogic");

// Fixed "now" so tests are deterministic (2026-07-15T16:00:00Z).
const NOW = Date.parse("2026-07-15T16:00:00Z");
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();
const daysAhead = (n) => new Date(NOW + n * DAY_MS).toISOString();

test("inNeedByWindow: true within 9 days (and when overdue), false beyond", () => {
  assert.equal(inNeedByWindow(daysAhead(8), NOW), true);
  assert.equal(inNeedByWindow(daysAhead(9), NOW), true);
  assert.equal(inNeedByWindow(daysAgo(2), NOW), true, "overdue need-by still urgent");
  assert.equal(inNeedByWindow(daysAhead(10), NOW), false);
  assert.equal(inNeedByWindow(undefined, NOW), false);
});

test("approval nudge fires after 4 days pending, not before (no need-by)", () => {
  const base = { approvalStatus: "Pending", lineItems: [] };
  const early = reminderPlan({ ...base, approvalRequestedDate: daysAgo(3) }, NOW);
  assert.deepEqual(early.reminders, []);
  assert.equal(early.cadenceDays, 3);

  const late = reminderPlan({ ...base, approvalRequestedDate: daysAgo(5) }, NOW);
  assert.deepEqual(late.reminders, ["approval"]);
});

test("need-by window: daily cadence + approval nudge even before 4 days", () => {
  const plan = reminderPlan(
    { approvalStatus: "Pending", approvalRequestedDate: daysAgo(1), needByDate: daysAhead(5), lineItems: [] },
    NOW
  );
  assert.equal(plan.cadenceDays, 1);
  assert.deepEqual(plan.reminders, ["approval"]);
});

test("order nudge: approved + unordered item, only inside need-by window", () => {
  const items = [{ qty: 1, cost: 5 }]; // no vendor => unordered
  const outside = reminderPlan({ approvalStatus: "Approved", lineItems: items }, NOW);
  assert.deepEqual(outside.reminders, [], "no order nudge outside need-by window");

  const inside = reminderPlan(
    { approvalStatus: "Approved", needByDate: daysAhead(4), lineItems: items },
    NOW
  );
  assert.deepEqual(inside.reminders, ["order"]);
});

test("catalog order: order nudge after 4 days without a need-by date, daily cadence", () => {
  const items = [{ qty: 1, cost: 5 }]; // no vendor => unordered
  // Ad-hoc approved+unordered with no need-by: no order nudge, 3-day cadence.
  const adhoc = reminderPlan({ approvalStatus: "Approved", approvalRequestedDate: daysAgo(6), lineItems: items }, NOW);
  assert.deepEqual(adhoc.reminders, []);
  assert.equal(adhoc.cadenceDays, 3);

  // Catalog approved+unordered, 6 days since submit: order nudge + daily cadence.
  const catalog = reminderPlan(
    { approvalStatus: "Approved", orderType: "catalog", approvalRequestedDate: daysAgo(6), lineItems: items },
    NOW
  );
  assert.deepEqual(catalog.reminders, ["order"]);
  assert.equal(catalog.cadenceDays, 1);

  // Catalog approved but only 3 days in: not yet.
  const early = reminderPlan(
    { approvalStatus: "Approved", orderType: "catalog", approvalRequestedDate: daysAgo(3), lineItems: items },
    NOW
  );
  assert.deepEqual(early.reminders, []);
});

test("catalog order pending: approval nudge after 4 days, daily cadence", () => {
  const plan = reminderPlan(
    { approvalStatus: "Pending", orderType: "catalog", approvalRequestedDate: daysAgo(5), lineItems: [] },
    NOW
  );
  assert.deepEqual(plan.reminders, ["approval"]);
  assert.equal(plan.cadenceDays, 1);
});

test("receive nudge: expected delivery passed", () => {
  const items = [{ qty: 1, vendor: "Amazon", expectedDelivery: daysAgo(1) }];
  const plan = reminderPlan({ approvalStatus: "Approved", lineItems: items, orderedAt: daysAgo(2) }, NOW);
  assert.deepEqual(plan.reminders, ["receive"]);
});

test("receive nudge: 7+ days since ordered when no expected-delivery date", () => {
  assert.equal(receiveDue([{ qty: 1, vendor: "A" }], daysAgo(7), NOW), true);
  assert.equal(receiveDue([{ qty: 1, vendor: "A" }], daysAgo(6), NOW), false);
  // fully received item never triggers
  assert.equal(
    receiveDue([{ qty: 2, vendor: "A", receivedDate: daysAgo(1), receivedQty: 2 }], daysAgo(30), NOW),
    false
  );
});

test("no reminders once fully received / not applicable", () => {
  const plan = reminderPlan(
    {
      approvalStatus: "Approved",
      needByDate: daysAhead(2),
      lineItems: [{ qty: 1, vendor: "A", receivedDate: daysAgo(1), receivedQty: 1 }],
      orderedAt: daysAgo(10),
    },
    NOW
  );
  assert.deepEqual(plan.reminders, []);
});

test("shouldSend throttle honors cadence", () => {
  assert.equal(shouldSend(undefined, 3, NOW), true, "never sent => send");
  assert.equal(shouldSend(daysAgo(1), 3, NOW), false, "1 day ago, 3-day cadence => wait");
  assert.equal(shouldSend(daysAgo(3), 3, NOW), true, "3 days ago => send");
  assert.equal(shouldSend(daysAgo(1), 1, NOW), true, "daily cadence, 1 day ago => send");
  assert.equal(shouldSend("garbage", 3, NOW), true, "unparseable => send");
});

test("partially-received ordered item still nudges to receive", () => {
  const items = [{ qty: 5, vendor: "A", receivedDate: daysAgo(1), receivedQty: 2, expectedDelivery: daysAgo(2) }];
  const plan = reminderPlan({ approvalStatus: "Approved", lineItems: items, orderedAt: daysAgo(3) }, NOW);
  assert.deepEqual(plan.reminders, ["receive"]);
});
