// Adapts an Uptime Kuma webhook payload into CreateTicket input. Kuma POSTs its
// own shape — { heartbeat: {status,msg,...}, monitor: {id,name,hostname,url,...},
// msg } — on every important state change (down, up, pending, maintenance). We
// only turn DOWN events into tickets; everything else is acked with 200 and no
// ticket. externalRef = kuma-<monitorId> so a flapping monitor dedupes onto one
// open ticket (and its recovery/up events are simply ignored until a human
// resolves it). Pure — no I/O, unit-testable.

// Uptime Kuma heartbeat.status: 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE.
const KUMA_DOWN = 0;
const KUMA_UP = 1;

// Kuma monitor tags carry the site's priority rating. Map the most severe tag on
// the monitor to the ticket priority; an untagged monitor defaults to Normal.
// (Tags ride along in the webhook's monitor payload — monitor.toJSON includes them.)
const TAG_TO_PRIORITY = { Critical: "Urgent", Important: "High", Moderate: "Normal" };

function priorityFromTags(tags) {
  const names = new Set((Array.isArray(tags) ? tags : []).map((t) => (t && t.name) || ""));
  if (names.has("Critical")) return "Urgent";
  if (names.has("Important")) return "High";
  if (names.has("Moderate")) return "Normal";
  return "Normal";
}

function isKumaPayload(body) {
  return !!(body && typeof body === "object" && body.heartbeat && body.monitor);
}

// "down" → open/dedupe a ticket, "up" → stamp the recovery so the ticket can be
// auto-closed once the monitor stays up, "other" (pending/maintenance) → ignore.
function kumaEventKind(body) {
  if (!isKumaPayload(body)) return null;
  const status = Number(body.heartbeat.status);
  if (status === KUMA_DOWN) return "down";
  if (status === KUMA_UP) return "up";
  return "other";
}

// The dedup key tying every event for a monitor to one ticket. Falls back to the
// monitor name when Kuma omits the id, so DOWN and UP still land on the same ref.
function kumaExternalRef(monitor) {
  const m = monitor || {};
  const id = m.id != null && m.id !== "" ? m.id : String(m.name || "Monitor");
  return `kuma-${id}`;
}

// Returns CreateTicket input for a DOWN event, or null to skip (up/pending/etc).
function adaptKumaPayload(body) {
  const hb = (body && body.heartbeat) || {};
  if (Number(hb.status) !== KUMA_DOWN) return null;
  const m = (body && body.monitor) || {};
  const name = String(m.name || "Monitor");
  const where = m.hostname || m.url || "";
  const detail = String(body.msg || hb.msg || "").trim();
  const description =
    `Uptime Kuma detected ${name}${where ? ` (${where})` : ""} is DOWN.` +
    (detail ? `\n\n${detail}` : "");
  return {
    title: `${name} is DOWN`,
    description,
    problemType: "Tech",
    priority: priorityFromTags(m.tags),
    source: "uptime-kuma",
    externalRef: kumaExternalRef(m),
  };
}

module.exports = {
  isKumaPayload,
  kumaEventKind,
  kumaExternalRef,
  adaptKumaPayload,
  priorityFromTags,
  TAG_TO_PRIORITY,
};
