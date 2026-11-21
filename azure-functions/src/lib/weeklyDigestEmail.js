// HTML for the weekly personal digest (weeklyDigest.js). Rendering only — the
// content is decided in weeklyDigestLogic.js.
//
// The subject deliberately does NOT contain "Ticket #<n>": pollInboundReplies turns
// any reply whose subject matches /Ticket #(\d+)/ into a comment on that ticket, and
// a reply to a multi-ticket summary must not land on one of them.

const { config } = require("./graphHelpers");
const { DIGEST_TIME_ZONE } = require("./weeklyDigestLogic");

const PRIORITY_COLORS = { Urgent: "#b91c1c", High: "#c2410c", Normal: "#374151", Low: "#6b7280" };

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => map[c]);
}

function fmtDay(value) {
  const s = String(value || "");
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: DIGEST_TIME_ZONE, weekday: "short", month: "short", day: "numeric" }).format(d);
}

function fmtRange(startMs, endMs) {
  const f = (ms) =>
    new Intl.DateTimeFormat("en-US", { timeZone: DIGEST_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(ms));
  return `${f(startMs)} – ${f(endMs)}`;
}

function daysOpen(created, nowMs) {
  const t = Date.parse(created || "");
  if (Number.isNaN(t)) return "";
  const d = Math.floor((nowMs - t) / 86400000);
  return d <= 0 ? "opened today" : `open ${d} day${d === 1 ? "" : "s"}`;
}

const ticketUrl = (id) => `${config.appUrl}?ticket=${encodeURIComponent(id)}`;
const purchaseUrl = (id) => `${config.appUrl}/purchase?id=${encodeURIComponent(id)}`;

function eventList(events, recipientEmail) {
  if (!events.length) return `<div style="color:#9ca3af;font-size:13px;margin-top:4px;">No changes this week</div>`;
  const rows = events
    .map((e) => {
      const who = e.actorEmail && e.actorEmail === recipientEmail ? "You" : e.actor;
      const label =
        e.kind === "comment"
          ? `<strong>${escapeHtml(who || "Someone")}</strong> commented: “${escapeHtml(e.text)}”`
          : e.kind === "internal"
            ? `<strong>${escapeHtml(who || "Someone")}</strong> added an internal note: “${escapeHtml(e.text)}”`
            : `${escapeHtml(e.text)}${who ? ` <span style="color:#6b7280;">— ${escapeHtml(who)}</span>` : ""}`;
      return `<li style="margin:2px 0;"><span style="color:#6b7280;">${escapeHtml(fmtDay(e.at))}:</span> ${label}</li>`;
    })
    .join("");
  return `<ul style="margin:6px 0 0 0;padding-left:18px;font-size:13px;">${rows}</ul>`;
}

function ticketRow(t, recipientEmail, nowMs) {
  const color = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.Normal;
  const meta = [t.status, `<span style="color:${color};">${escapeHtml(t.priority)}</span>`, escapeHtml(t.department), daysOpen(t.created, nowMs)]
    .filter(Boolean)
    .join(" · ");
  return `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0;">
    <a href="${ticketUrl(t.id)}" style="color:#1e3a5f;font-weight:600;text-decoration:none;">#${escapeHtml(t.id)} ${escapeHtml(t.title)}</a>
    <div style="color:#6b7280;font-size:13px;">${meta}</div>
    ${eventList(t.events, recipientEmail)}
  </div>`;
}

function section(title, subtitle, inner) {
  return `<h2 style="font-size:18px;color:#1e3a5f;margin:24px 0 4px 0;">${escapeHtml(title)}</h2>
    ${subtitle ? `<div style="color:#6b7280;font-size:13px;margin-bottom:4px;">${subtitle}</div>` : ""}
    ${inner}`;
}

const emptyNote = (text) => `<p style="color:#6b7280;font-size:14px;margin:4px 0;">${escapeHtml(text)}</p>`;

function changedCount(list) {
  return list.filter((t) => t.events.length > 0).length;
}

function purchaseRow(p) {
  const total = p.total > 0 ? ` · $${p.total.toFixed(2)}` : "";
  const meta = [escapeHtml(p.status), p.requester ? `requested by ${escapeHtml(p.requester)}` : "", `${p.itemCount} item${p.itemCount === 1 ? "" : "s"}${total}`]
    .filter(Boolean)
    .join(" · ");
  const events = p.events
    .map((e) => `<li style="margin:2px 0;"><span style="color:#6b7280;">${escapeHtml(fmtDay(e.at))}:</span> ${escapeHtml(e.text)}</li>`)
    .join("");
  return `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0;">
    <a href="${purchaseUrl(p.id)}" style="color:#1e3a5f;font-weight:600;text-decoration:none;">${escapeHtml(p.title)}</a>
    <div style="color:#6b7280;font-size:13px;">${meta} · <em>you: ${escapeHtml(p.roles.join(", "))}</em></div>
    <ul style="margin:6px 0 0 0;padding-left:18px;font-size:13px;">${events}</ul>
  </div>`;
}

// digest = { recipient, startMs, endMs, tickets: { mine, queues, closed }, purchases }
// Returns { subject, html }.
function weeklyDigestEmail(digest, nowMs = Date.now()) {
  const { recipient, startMs, endMs, tickets, purchases } = digest;
  const me = recipient.email;
  const range = fmtRange(startMs, endMs);
  const queueOpen = tickets.queues.reduce((n, q) => n + q.open.length, 0);
  const openTotal = tickets.mine.length + queueOpen;

  const parts = [];
  parts.push(
    `<p style="margin:0 0 8px 0;">Here's your week in the Help Desk (${escapeHtml(range)}):
      <strong>${tickets.mine.length}</strong> open ticket${tickets.mine.length === 1 ? "" : "s"} assigned to you${
        tickets.queues.length ? `, <strong>${queueOpen}</strong> in your queue${tickets.queues.length === 1 ? "" : "s"}` : ""
      }, <strong>${tickets.closed.length}</strong> closed this week, and <strong>${purchases.length}</strong> purchase request${
        purchases.length === 1 ? "" : "s"
      } with updates.</p>`
  );

  parts.push(
    section(
      "Assigned to you",
      tickets.mine.length ? `${tickets.mine.length} open · ${changedCount(tickets.mine)} changed this week` : "",
      tickets.mine.length ? tickets.mine.map((t) => ticketRow(t, me, nowMs)).join("") : emptyNote("No open tickets assigned to you.")
    )
  );

  for (const q of tickets.queues) {
    parts.push(
      section(
        `Queue: ${q.address}`,
        q.open.length ? `${q.open.length} open · ${changedCount(q.open)} changed this week` : "",
        q.open.length ? q.open.map((t) => ticketRow(t, me, nowMs)).join("") : emptyNote("No open tickets in this queue.")
      )
    );
  }

  const alerts = tickets.monitorAlerts || [];
  const alertLine = alerts.length
    ? `<p style="color:#6b7280;font-size:13px;margin:8px 0;">Plus ${alerts.length} monitor alert${alerts.length === 1 ? "" : "s"} that Uptime Kuma opened and auto-closed: ${alerts
        .map((t) => `<a href="${ticketUrl(t.id)}" style="color:#6b7280;">#${escapeHtml(t.id)} ${escapeHtml(t.title)}</a>`)
        .join(", ")}.</p>`
    : "";
  parts.push(
    section(
      "Resolved or closed this week",
      "",
      (tickets.closed.length
        ? tickets.closed.map((t) => ticketRow(t, me, nowMs)).join("")
        : emptyNote(alerts.length ? "No other tickets closed this week." : "None this week.")) + alertLine
    )
  );

  parts.push(
    section(
      "Your purchase requests — this week's changes",
      "Requests you submitted, approved, ordered, received, cancelled, or are on.",
      purchases.length ? purchases.map(purchaseRow).join("") : emptyNote("No changes to your purchase requests this week.")
    )
  );

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#333;margin:0;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">
    <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:22px;">Your weekly Help Desk summary</h1>
      <p style="margin:6px 0 0 0;opacity:0.9;">${escapeHtml(range)}</p>
    </div>
    <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;">
      ${parts.join("\n")}
      <div style="text-align:center;margin:24px 0 4px 0;">
        <a href="${config.appUrl}" style="display:inline-block;padding:10px 20px;border-radius:6px;background:#1e3a5f;color:white;text-decoration:none;font-weight:600;">Open the Help Desk</a>
      </div>
    </div>
    <div style="text-align:center;padding:16px;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;">Sent every Tuesday at 10 AM by SkyPark Help Desk. Please do not reply to this email.</p>
    </div>
  </div></body></html>`;

  const subject = `Weekly Help Desk summary (${range}): ${openTotal} open, ${tickets.closed.length} closed, ${purchases.length} purchase update${
    purchases.length === 1 ? "" : "s"
  }`;
  return { subject, html };
}

module.exports = { weeklyDigestEmail };
