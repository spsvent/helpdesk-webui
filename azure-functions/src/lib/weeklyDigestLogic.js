// Pure logic for the weekly personal digest (weeklyDigest.js).
//
// One email per configured person, once a week, summarizing:
//   1. open tickets assigned to them personally
//   2. open tickets assigned to each queue address they watch (e.g. itav@)
//   3. tickets in either group that were resolved/closed during the week (Uptime
//      Kuma alerts closed by its recovery sweep are folded into one compact line)
//   4. purchase requests they are involved in that changed during the week
//
// No Graph / IO here — every function takes plain SharePoint `fields` objects and an
// explicit window, so the whole digest is unit-testable (test/weeklyDigest.test.js).
//
// Data sources and why:
//   - Ticket changes come from the ActivityLog list (status, priority, assignment,
//     approval events) plus the TicketComments list. ActivityLog's own
//     comment_added / email_sent rows are skipped: comments are read from the
//     comments list directly (not every comment path logs), and sent-mail rows are
//     noise in a human summary.
//   - Purchase requests are NOT in the ActivityLog, and their Modified stamp moves
//     every day when purchaseReminders writes LastReminderSent. So purchase "changes"
//     are derived from the record's own event dates (submitted, decided, ordered,
//     received, cancelled, thread messages), never from Modified.

const CLOSED_STATUSES = new Set(["Resolved", "Closed"]);
const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const SKIPPED_EVENT_TYPES = new Set(["email_sent", "comment_added"]);
const DIGEST_TIME_ZONE = "America/Los_Angeles";

const lc = (s) => String(s || "").trim().toLowerCase();

// WEEKLY_DIGEST_RECIPIENTS: comma-separated entries, each
//   person@x.com                      → only tickets assigned to that person
//   person@x.com=queue@x.com;q2@x.com → plus tickets assigned to those queue addresses
// Unset / empty → no digests are sent.
function parseRecipients(raw) {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [person, queues = ""] = entry.split("=");
      return {
        email: lc(person),
        queues: queues.split(";").map(lc).filter(Boolean),
      };
    })
    .filter((r) => r.email.includes("@"))
    // A person listed twice gets one email, watching the union of their queues.
    .reduce((acc, r) => {
      const existing = acc.find((x) => x.email === r.email);
      if (existing) existing.queues = Array.from(new Set([...existing.queues, ...r.queues]));
      else acc.push(r);
      return acc;
    }, []);
}

const DIGEST_WEEKDAY = "Tue";
const DIGEST_HOUR = 10;

function zonedParts(ms, timeZone = DIGEST_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

// True when `now` is the digest's local weekday + hour. The timer fires at both
// 17:00 and 18:00 UTC on Tuesdays (Functions on Linux/Flex can't take a time zone),
// and this gate keeps exactly one of them: 10 AM Pacific in PST and PDT.
function isDigestTime(nowMs, { weekday = DIGEST_WEEKDAY, hour = DIGEST_HOUR, timeZone = DIGEST_TIME_ZONE } = {}) {
  const p = zonedParts(nowMs, timeZone);
  return p.weekday === weekday && p.hour === hour;
}

// The UTC instant of a wall-clock time in `timeZone` (handles DST: the offset is
// re-read at the candidate instant, so 10 AM is 10 AM in both PST and PDT).
function zonedTimeToUtc(year, month, day, hour, timeZone = DIGEST_TIME_ZONE) {
  const guess = Date.UTC(year, month - 1, day, hour);
  const offsetAt = (ms) => {
    const p = zonedParts(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

// The digest window: the most recent completed Tuesday-10-AM-to-Tuesday-10-AM
// (Pacific) week at or before `nowMs`. Boundaries are wall-clock scheduled times,
// not "now minus 168 hours", so consecutive digests tile exactly — no gap or
// overlap across DST changes or when a run starts a few seconds late.
function digestWindow(nowMs) {
  const p = zonedParts(nowMs);
  // Walk back from today's local date to the latest Tuesday 10 AM <= now.
  let { year, month, day } = p;
  for (let i = 0; i < 8; i++) {
    const noonUtc = Date.UTC(year, month - 1, day - i, 12);
    const d = new Date(noonUtc);
    const local = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const endMs = zonedTimeToUtc(local.year, local.month, local.day, DIGEST_HOUR);
    if (zonedParts(endMs).weekday !== DIGEST_WEEKDAY || endMs > nowMs) continue;
    const prev = new Date(Date.UTC(local.year, local.month - 1, local.day - 7, 12));
    const startMs = zonedTimeToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), DIGEST_HOUR);
    return { startMs, endMs };
  }
  throw new Error("digestWindow: no Tuesday found in the last 8 days");
}

// YYYY-MM-DD for an instant, in the digest's time zone.
function localDate(ms, timeZone = DIGEST_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms)
  );
}

// Is a stored value inside the window [startMs, endMs)?
// Timestamps compare by instant. Date-only values ("2026-11-18", which several
// purchase columns use) have no time, so they compare by whole Pacific calendar
// day: [start day, end day). The send day itself rolls into NEXT week's digest —
// a receipt dated Tuesday may be entered after the 10 AM send — so every
// date-only event lands in exactly one digest, at worst a week late.
function inWindow(value, startMs, endMs) {
  if (!value) return false;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s >= localDate(startMs) && s < localDate(endMs);
  }
  const t = Date.parse(s);
  return !Number.isNaN(t) && t >= startMs && t < endMs;
}

// Sort key for mixed date-only / ISO values.
function eventTime(value) {
  const s = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T12:00:00Z`);
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

// Plain-text snippet from a rich-text (HTML) comment body.
function snippet(html, max = 180) {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const CLOSE_STATUS_RE = /\bto\s+"?(Resolved|Closed)"?/i;

// Did this ActivityLog row move the ticket to Resolved/Closed? Status-change rows
// carry the new status in Details (newStatus from the SPA/agent API, `to` from the
// Kuma sweep). A merge closes only the SECONDARY ticket — the same event is also
// logged on the surviving primary. (ticket_converted is NOT a closure: the SPA logs
// it for category changes.)
function isClosingActivity(a) {
  let d = {};
  try {
    d = JSON.parse(a.Details || "{}") || {};
  } catch {
    d = {};
  }
  if (a.EventType === "ticket_merged") {
    return d.secondaryId != null && String(d.secondaryId) === String(a.TicketId || "");
  }
  if (a.EventType !== "ticket_status_changed" && a.EventType !== "StatusChanged") return false;
  const to = d.newStatus || d.to;
  if (to) return CLOSED_STATUSES.has(to);
  return CLOSE_STATUS_RE.test(String(a.Title || ""));
}

// Kuma's recovery sweep (autoCloseRecovered.js) is the only automatic closer.
function isAutoRecoveryClose(a) {
  return a.EventType === "StatusChanged" && /auto-closed after monitor recovery/i.test(String(a.Title || ""));
}

// Who a ticket is assigned to. Mirrors the SPA's "Assigned to me" filter
// (filterUtils.ts): the OriginalAssignedTo text column wins — every assignment path
// writes it — and the AssignedTo person field is the fallback for older tickets.
function ticketAssignee(fields, siteUserEmailById = {}) {
  const text = lc(fields.OriginalAssignedTo);
  if (text) return text;
  const lookup = fields.AssignedToLookupId;
  return lookup != null ? lc(siteUserEmailById[String(lookup)]) : "";
}

// ticket → { "me" | queue address | null } for one recipient.
function ticketBucket(fields, recipient, siteUserEmailById) {
  const assignee = ticketAssignee(fields, siteUserEmailById);
  if (!assignee) return null;
  if (assignee === recipient.email) return "me";
  if (recipient.queues.includes(assignee)) return assignee;
  return null;
}

// This week's events for one ticket, oldest first. `activity` and `comments` are
// already-fetched SharePoint `fields` objects (each with a Created timestamp).
function ticketEvents(ticketId, activity, comments, startMs, endMs) {
  const id = String(ticketId);
  const events = [];
  for (const a of activity) {
    if (String(a.TicketId || "") !== id) continue;
    if (SKIPPED_EVENT_TYPES.has(a.EventType)) continue;
    if (!inWindow(a.Created, startMs, endMs)) continue;
    events.push({
      at: a.Created,
      kind: "activity",
      actor: a.ActorName || a.Actor || "",
      actorEmail: lc(a.Actor),
      text: a.Title || a.EventType || "Updated",
      closes: isClosingActivity(a),
      autoClose: isAutoRecoveryClose(a),
    });
  }
  for (const c of comments) {
    if (String(Math.trunc(Number(c.TicketID))) !== id) continue;
    const at = c.Created;
    if (!inWindow(at, startMs, endMs)) continue;
    events.push({
      at,
      kind: c.IsInternal === true ? "internal" : "comment",
      actor: c.OriginalAuthor || c.AuthorName || "",
      actorEmail: lc(c.AuthorEmail),
      text: snippet(c.Body || c.CommentBody),
      // The Vikunja "task done" path resolves a ticket with a Status Change comment
      // and no ActivityLog row.
      closes: c.CommentType === "Status Change",
      autoClose: false,
    });
  }
  return events.sort((a, b) => eventTime(a.at) - eventTime(b.at));
}

function ticketSummary(fields, events) {
  return {
    id: String(fields.id),
    title: fields.Title || "Untitled",
    status: fields.Status || "New",
    priority: fields.Priority || "Normal",
    department: fields.ProblemType || "",
    created: fields.Created,
    events,
  };
}

// Tickets filed by the Uptime Kuma webhook (CreateTicket stamps ExternalRef "kuma-<id>").
function isMonitorAlert(fields) {
  return /^kuma-/i.test(String(fields.ExternalRef || "")) || /uptime-kuma/i.test(String(fields.SupportChannel || ""));
}

// Open tickets: changed-this-week first, then by priority, then newest first.
function sortOpen(list) {
  return list.sort(
    (a, b) =>
      Number(b.events.length > 0) - Number(a.events.length > 0) ||
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
      Number(b.id) - Number(a.id)
  );
}

// Build the ticket part of one recipient's digest.
//   tickets:   Tickets list `fields` (each with .id)
//   activity:  ActivityLog `fields` created inside the window (wider is fine)
//   comments:  TicketComments `fields` (+ AuthorName/AuthorEmail from createdBy)
// Returns { mine, queues: [{ address, open }], closed, monitorAlerts }.
function buildTicketDigest({ tickets, activity, comments, recipient, siteUserEmailById, startMs, endMs }) {
  const mine = [];
  const queueOpen = new Map(recipient.queues.map((q) => [q, []]));
  const closed = [];
  const monitorAlerts = [];

  for (const fields of tickets) {
    const bucket = ticketBucket(fields, recipient, siteUserEmailById);
    if (!bucket) continue;
    const events = ticketEvents(fields.id, activity, comments, startMs, endMs);
    const summary = ticketSummary(fields, events);
    summary.assignedTo = bucket === "me" ? "you" : bucket;

    if (CLOSED_STATUSES.has(summary.status)) {
      // Only tickets actually closed this week — a thank-you comment on an old closed
      // ticket isn't a closure. Monitor alerts closed by Kuma's own recovery sweep
      // get one compact line instead of a full card each, so they don't bury the
      // human closures; a monitor ticket a person resolved stays a full card.
      const closing = events.filter((e) => e.closes);
      if (!closing.length) continue;
      const lastClose = closing[closing.length - 1];
      (isMonitorAlert(fields) && lastClose.autoClose ? monitorAlerts : closed).push(summary);
    } else if (bucket === "me") {
      mine.push(summary);
    } else {
      queueOpen.get(bucket).push(summary);
    }
  }

  return {
    mine: sortOpen(mine),
    queues: recipient.queues.map((address) => ({ address, open: sortOpen(queueOpen.get(address)) })),
    closed: closed.sort((a, b) => Number(b.id) - Number(a.id)),
    monitorAlerts: monitorAlerts.sort((a, b) => Number(b.id) - Number(a.id)),
  };
}

function parseJsonArray(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function splitEmails(raw) {
  return String(raw || "")
    .split(/[;,]/)
    .map(lc)
    .filter(Boolean);
}

// How `email` is involved in a purchase request (empty array = not involved).
function purchaseRoles(fields, email) {
  const me = lc(email);
  const roles = [];
  if (lc(fields.RequesterEmail || fields.CreatedByEmail) === me) roles.push("Requester");
  if (lc(fields.ApprovedByEmail) === me) roles.push("Approver");
  if (lc(fields.PurchasedByEmail) === me) roles.push("Purchaser");
  if (lc(fields.ReceivedByEmail) === me) roles.push("Receiver");
  if (lc(fields.CancelledByEmail) === me) roles.push("Cancelled it");
  if (splitEmails(fields.ParticipantEmails).includes(me)) roles.push("Participant");
  if (!roles.length && parseJsonArray(fields.PurchaseThreadJSON).some((m) => lc(m && m.email) === me)) {
    roles.push("Thread");
  }
  return roles;
}

// This week's events on one purchase request, oldest first.
function purchaseEvents(fields, startMs, endMs) {
  const events = [];
  const add = (at, text) => {
    if (inWindow(at, startMs, endMs)) events.push({ at, text });
  };

  add(fields.ApprovalRequestedDate || fields.Created, `Submitted by ${fields.RequesterName || "requester"}`);

  if (fields.ApprovalDate) {
    const by = fields.ApprovedByName ? ` by ${fields.ApprovedByName}` : "";
    const verb =
      fields.ApprovalStatus === "Denied"
        ? "Denied"
        : fields.ApprovalStatus === "Changes Requested"
          ? "Changes requested"
          : fields.PurchaseStatus === "Approved with Changes"
            ? "Approved with changes"
            : "Approved";
    const notes = fields.ApprovalNotes ? ` — "${snippet(fields.ApprovalNotes, 140)}"` : "";
    add(fields.ApprovalDate, `${verb}${by}${notes}`);
  }

  add(fields.PurchasedDate, `Ordered${fields.PurchasedByEmail ? ` by ${fields.PurchasedByEmail}` : ""}`);

  const items = parseJsonArray(fields.PurchaseLineItemsJSON);
  const itemReceipts = items.filter((it) => it && it.receivedDate && inWindow(it.receivedDate, startMs, endMs));
  for (const it of itemReceipts) {
    const qty = it.receivedQty != null ? ` (${it.receivedQty} of ${it.qty ?? "?"})` : "";
    events.push({ at: it.receivedDate, text: `Received: ${it.name || "item"}${qty}` });
  }
  // Record-level receipt only when no per-item receipt already said so.
  if (!itemReceipts.length) add(fields.ReceivedDate, "Marked received");

  if (fields.CancelledDate) {
    const by = fields.CancelledByName ? ` by ${fields.CancelledByName}` : "";
    const why = fields.CancelReason ? ` — "${snippet(fields.CancelReason, 140)}"` : "";
    add(fields.CancelledDate, `Cancelled${by}${why}`);
  }

  for (const m of parseJsonArray(fields.PurchaseThreadJSON)) {
    if (!m) continue;
    add(m.at, `Message from ${m.author || m.email || "someone"}: "${snippet(m.text, 160)}"`);
  }

  return events.sort((a, b) => eventTime(a.at) - eventTime(b.at));
}

// Purchase requests the recipient is involved in that changed this week.
function buildPurchaseDigest({ purchases, email, startMs, endMs }) {
  const out = [];
  for (const fields of purchases) {
    const roles = purchaseRoles(fields, email);
    if (!roles.length) continue;
    const events = purchaseEvents(fields, startMs, endMs);
    if (!events.length) continue;
    const items = parseJsonArray(fields.PurchaseLineItemsJSON);
    const total = items.reduce((s, it) => (it ? s + (Number(it.qty) || 0) * (Number(it.actualCost ?? it.cost) || 0) : s), 0);
    out.push({
      id: String(fields.id),
      title: fields.Title || "Untitled",
      status: fields.PurchaseStatus || "",
      requester: fields.RequesterName || "",
      roles,
      itemCount: items.length,
      total,
      events,
    });
  }
  // Most recently active first.
  return out.sort((a, b) => eventTime(b.events[b.events.length - 1].at) - eventTime(a.events[a.events.length - 1].at));
}

module.exports = {
  parseRecipients,
  isDigestTime,
  digestWindow,
  zonedTimeToUtc,
  localDate,
  inWindow,
  snippet,
  ticketAssignee,
  ticketBucket,
  ticketEvents,
  isClosingActivity,
  buildTicketDigest,
  purchaseRoles,
  purchaseEvents,
  buildPurchaseDigest,
  CLOSED_STATUSES,
  DIGEST_TIME_ZONE,
};
