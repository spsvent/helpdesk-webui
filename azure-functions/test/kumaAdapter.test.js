const { test } = require("node:test");
const assert = require("node:assert");
const { isKumaPayload, adaptKumaPayload, priorityFromTags } = require("../src/lib/kumaAdapter");
const { validateCreateTicketInput } = require("../src/lib/ticketIntake");

const down = {
  heartbeat: { status: 0, msg: "connect ECONNREFUSED 172.18.10.12:9100", time: "2026-07-18 21:00:00" },
  monitor: { id: 7, name: "Reindeer Room Printer", hostname: "172.18.10.12", url: "http://172.18.10.12" },
  msg: "[Reindeer Room Printer] [🔴 Down] connect ECONNREFUSED",
};

test("isKumaPayload detects the {heartbeat,monitor} shape", () => {
  assert.strictEqual(isKumaPayload(down), true);
  assert.strictEqual(isKumaPayload({ title: "x" }), false);
  assert.strictEqual(isKumaPayload(null), false);
});

test("adaptKumaPayload maps a DOWN event to ticket input", () => {
  const v = adaptKumaPayload(down);
  assert.strictEqual(v.title, "Reindeer Room Printer is DOWN");
  assert.match(v.description, /Reindeer Room Printer \(172\.18\.10\.12\) is DOWN/);
  assert.match(v.description, /ECONNREFUSED/); // carries the error detail
  assert.strictEqual(v.problemType, "Tech");
  assert.strictEqual(v.priority, "Normal"); // untagged monitor → Normal
  assert.strictEqual(v.source, "uptime-kuma");
  assert.strictEqual(v.externalRef, "kuma-7");
});

test("priorityFromTags maps the most severe tag (Kuma priority rating)", () => {
  assert.strictEqual(priorityFromTags([{ name: "Critical" }]), "Urgent");
  assert.strictEqual(priorityFromTags([{ name: "Important" }]), "High");
  assert.strictEqual(priorityFromTags([{ name: "Moderate" }]), "Normal");
  assert.strictEqual(priorityFromTags([]), "Normal"); // untagged
  assert.strictEqual(priorityFromTags([{ name: "Moderate" }, { name: "Critical" }]), "Urgent"); // most severe wins
  assert.strictEqual(priorityFromTags(undefined), "Normal");
});

test("adaptKumaPayload sets ticket priority from the monitor's tag", () => {
  const crit = adaptKumaPayload({ ...down, monitor: { ...down.monitor, tags: [{ name: "Critical", color: "#DC2626" }] } });
  assert.strictEqual(crit.priority, "Urgent");
  const imp = adaptKumaPayload({ ...down, monitor: { ...down.monitor, tags: [{ name: "Important" }] } });
  assert.strictEqual(imp.priority, "High");
});

test("adaptKumaPayload skips non-DOWN events (up/pending/maintenance)", () => {
  for (const status of [1, 2, 3]) {
    assert.strictEqual(adaptKumaPayload({ ...down, heartbeat: { ...down.heartbeat, status } }), null);
  }
});

test("externalRef falls back to the monitor name when id is missing", () => {
  const v = adaptKumaPayload({ ...down, monitor: { name: "DNS" } });
  assert.strictEqual(v.externalRef, "kuma-DNS");
});

test("the adapted DOWN payload passes CreateTicket validation", () => {
  const { ok, value } = validateCreateTicketInput(adaptKumaPayload(down));
  assert.strictEqual(ok, true);
  assert.strictEqual(value.externalRef, "kuma-7");
  assert.strictEqual(value.problemType, "Tech");
});
