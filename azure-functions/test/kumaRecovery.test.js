const { test } = require("node:test");
const assert = require("node:assert");
const { hasHumanActivity, autoCloseDecision } = require("../src/lib/kumaRecovery");
const { kumaEventKind, kumaExternalRef, adaptKumaPayload } = require("../src/lib/kumaAdapter");

const NOW = Date.parse("2026-08-06T12:00:00Z");
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

// A ticket the sweep should close: kuma-filed, untouched, recovered 90 minutes ago.
const ticket = (over = {}) => ({
  id: "528",
  fields: {
    Title: "Main Server Room 24 port LITE switch is DOWN",
    Status: "New",
    ExternalRef: "kuma-16",
    ExternalRecoveredAt: minsAgo(90),
    ...over,
  },
});

// ---- event routing ----

test("kumaEventKind routes down/up/other", () => {
  const base = { monitor: { id: 16, name: "switch" } };
  assert.strictEqual(kumaEventKind({ ...base, heartbeat: { status: 0 } }), "down");
  assert.strictEqual(kumaEventKind({ ...base, heartbeat: { status: 1 } }), "up");
  assert.strictEqual(kumaEventKind({ ...base, heartbeat: { status: 2 } }), "other"); // pending
  assert.strictEqual(kumaEventKind({ ...base, heartbeat: { status: 3 } }), "other"); // maintenance
  assert.strictEqual(kumaEventKind({ title: "not kuma" }), null);
});

test("UP and DOWN for one monitor resolve to the same externalRef", () => {
  const monitor = { id: 16, name: "Main Server Room 24 port LITE switch", hostname: "10.0.0.86" };
  const down = adaptKumaPayload({ heartbeat: { status: 0 }, monitor, msg: "down" });
  assert.strictEqual(down.externalRef, kumaExternalRef(monitor));
  assert.strictEqual(kumaExternalRef(monitor), "kuma-16");
});

test("kumaExternalRef falls back to the monitor name, matching the DOWN path", () => {
  assert.strictEqual(kumaExternalRef({ name: "DNS" }), "kuma-DNS");
  assert.strictEqual(kumaExternalRef({ id: "", name: "DNS" }), "kuma-DNS");
  assert.strictEqual(kumaExternalRef({}), "kuma-Monitor");
  assert.strictEqual(kumaExternalRef(undefined), "kuma-Monitor");
});

test("monitor id 0 is a real id, not a missing one", () => {
  assert.strictEqual(kumaExternalRef({ id: 0, name: "DNS" }), "kuma-0");
});

// ---- human activity ----

test("hasHumanActivity ignores API-authored comments", () => {
  assert.strictEqual(hasHumanActivity([{ fields: { OriginalAuthor: "API", Body: "Repeat alert" } }]), false);
  assert.strictEqual(hasHumanActivity([]), false);
  assert.strictEqual(hasHumanActivity(undefined), false);
});

test("hasHumanActivity catches web-app comments (no OriginalAuthor) and emailed replies", () => {
  assert.strictEqual(hasHumanActivity([{ fields: { Body: "on my way" } }]), true);
  assert.strictEqual(hasHumanActivity([{ fields: { OriginalAuthor: "Jane Tech", Body: "replied by email" } }]), true);
  // one human among many API notes is still engagement
  const mixed = [{ fields: { OriginalAuthor: "API" } }, { fields: { OriginalAuthor: "API" } }, { fields: {} }];
  assert.strictEqual(hasHumanActivity(mixed), true);
});

// ---- close decision ----

test("closes an untouched kuma ticket whose monitor has held past the window", () => {
  const d = autoCloseDecision(ticket(), [{ fields: { OriginalAuthor: "API" } }], NOW, 60);
  assert.strictEqual(d.close, true);
  assert.strictEqual(d.reason, "recovered");
});

test("does not close while the monitor is still down", () => {
  const d = autoCloseDecision(ticket({ ExternalRecoveredAt: null }), [], NOW, 60);
  assert.deepStrictEqual([d.close, d.reason], [false, "still-down"]);
});

test("does not close before the hold window elapses", () => {
  const d = autoCloseDecision(ticket({ ExternalRecoveredAt: minsAgo(59) }), [], NOW, 60);
  assert.deepStrictEqual([d.close, d.reason], [false, "within-hold-window"]);
});

test("does not close a ticket somebody has picked up", () => {
  for (const status of ["In Progress", "On Hold", "Resolved", "Closed"]) {
    const d = autoCloseDecision(ticket({ Status: status }), [], NOW, 60);
    assert.deepStrictEqual([d.close, d.reason], [false, "status-not-new"], status);
  }
});

test("does not close a ticket a human has commented on", () => {
  const d = autoCloseDecision(ticket(), [{ fields: { Body: "replacing the switch tomorrow" } }], NOW, 60);
  assert.deepStrictEqual([d.close, d.reason], [false, "human-activity"]);
});

test("never touches tickets that did not come from uptime-kuma", () => {
  for (const ref of [undefined, "", "vikunja-42", "kuma", "KUMA-16"]) {
    const d = autoCloseDecision(ticket({ ExternalRef: ref }), [], NOW, 60);
    assert.deepStrictEqual([d.close, d.reason], [false, "not-a-kuma-ticket"], String(ref));
  }
});

test("a zero/negative hold disables auto-close rather than closing instantly", () => {
  for (const hold of [0, -1, undefined, NaN]) {
    const d = autoCloseDecision(ticket({ ExternalRecoveredAt: minsAgo(1) }), [], NOW, hold);
    assert.deepStrictEqual([d.close, d.reason], [false, "auto-close-disabled"], String(hold));
  }
});

test("an unparseable recovery stamp reads as still-down, not as an ancient recovery", () => {
  const d = autoCloseDecision(ticket({ ExternalRecoveredAt: "not a date" }), [], NOW, 60);
  assert.deepStrictEqual([d.close, d.reason], [false, "still-down"]);
});

test("handles a malformed item without throwing", () => {
  assert.strictEqual(autoCloseDecision({}, [], NOW, 60).close, false);
  assert.strictEqual(autoCloseDecision(undefined, undefined, NOW, 60).close, false);
});
