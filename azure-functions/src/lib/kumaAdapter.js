// Adapts an Uptime Kuma webhook payload into CreateTicket input. Kuma POSTs its
// own shape — { heartbeat: {status,msg,...}, monitor: {id,name,hostname,url,...},
// msg } — on every important state change (down, up, pending, maintenance). We
// only turn DOWN events into tickets; everything else is acked with 200 and no
// ticket. externalRef = kuma-<monitorId> so a flapping monitor dedupes onto one
// open ticket (and its recovery/up events are simply ignored until a human
// resolves it). Pure — no I/O, unit-testable.

// Uptime Kuma heartbeat.status: 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE.
const KUMA_DOWN = 0;

function isKumaPayload(body) {
  return !!(body && typeof body === "object" && body.heartbeat && body.monitor);
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
    priority: "High",
    source: "uptime-kuma",
    externalRef: `kuma-${m.id != null && m.id !== "" ? m.id : name}`,
  };
}

module.exports = { isKumaPayload, adaptKumaPayload };
