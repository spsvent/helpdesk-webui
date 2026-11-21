const test = require("node:test");
const assert = require("node:assert");
const {
  parseRecipients,
  isDigestTime,
  digestWindow,
  inWindow,
  snippet,
  ticketAssignee,
  ticketEvents,
  buildTicketDigest,
  purchaseRoles,
  purchaseEvents,
  buildPurchaseDigest,
} = require("../src/lib/weeklyDigestLogic");
const { weeklyDigestEmail } = require("../src/lib/weeklyDigestEmail");

// Tuesday 2026-11-24 10:00 PST (18:00 UTC); window = the previous 7 days.
const END = Date.parse("2026-11-24T18:00:00Z");
const START = END - 7 * 86400000;
const during = "2026-11-20T15:00:00Z";
const before = "2026-11-10T15:00:00Z";

const ME = { email: "me@x.com", queues: ["itav@x.com"] };

test("parseRecipients: person with queues, bare person, junk dropped, lowercased", () => {
  assert.deepEqual(parseRecipients(" Me@X.com=ITAV@x.com;pos@x.com , other@x.com ,, junk "), [
    { email: "me@x.com", queues: ["itav@x.com", "pos@x.com"] },
    { email: "other@x.com", queues: [] },
  ]);
  assert.deepEqual(parseRecipients("a@x.com=q1@x.com,A@x.com=q2@x.com"), [{ email: "a@x.com", queues: ["q1@x.com", "q2@x.com"] }], "duplicates merge");
  assert.deepEqual(parseRecipients(undefined), []);
});

test("isDigestTime: 10 AM Pacific on Tuesday in both PST and PDT, only one UTC firing each", () => {
  // PST (UTC-8): 18:00 UTC is 10 AM, 17:00 UTC is 9 AM.
  assert.equal(isDigestTime(Date.parse("2026-11-24T18:00:00Z")), true);
  assert.equal(isDigestTime(Date.parse("2026-11-24T17:00:00Z")), false);
  // PDT (UTC-7): 17:00 UTC is 10 AM, 18:00 UTC is 11 AM.
  assert.equal(isDigestTime(Date.parse("2026-07-14T17:00:00Z")), true);
  assert.equal(isDigestTime(Date.parse("2026-07-14T18:00:00Z")), false);
  // Wrong weekday.
  assert.equal(isDigestTime(Date.parse("2026-11-25T18:00:00Z")), false);
});

test("digestWindow: fixed Tue 10 AM Pacific boundaries, tiling across DST and late starts", () => {
  const iso = (w) => [new Date(w.startMs).toISOString(), new Date(w.endMs).toISOString()];
  // Normal PST week, run on time and 45 s late → identical window.
  assert.deepEqual(iso(digestWindow(Date.parse("2026-11-24T18:00:00Z"))), ["2026-11-17T18:00:00.000Z", "2026-11-24T18:00:00.000Z"]);
  assert.deepEqual(iso(digestWindow(Date.parse("2026-11-24T18:00:45Z"))), iso(digestWindow(Date.parse("2026-11-24T18:00:00Z"))));
  // Mid-week manual run → the last completed week.
  assert.deepEqual(iso(digestWindow(Date.parse("2026-11-21T22:00:00Z"))), ["2026-11-10T18:00:00.000Z", "2026-11-17T18:00:00.000Z"]);
  // Tuesday before 10 AM → still last week.
  assert.deepEqual(iso(digestWindow(Date.parse("2026-11-24T17:59:59Z"))), iso(digestWindow(Date.parse("2026-11-21T22:00:00Z"))));
  // Fall back (DST ends Sun 2026-11-01): starts 10 AM PDT, ends 10 AM PST — 169 h, no gap.
  const fall = digestWindow(Date.parse("2026-11-03T18:00:05Z"));
  assert.deepEqual(iso(fall), ["2026-10-27T17:00:00.000Z", "2026-11-03T18:00:00.000Z"]);
  assert.equal(digestWindow(Date.parse("2026-10-27T17:00:30Z")).endMs, fall.startMs, "previous week ends where this one starts");
  // Spring forward (DST starts Sun 2026-03-08): 10 AM PST → 10 AM PDT — 167 h, no overlap.
  const spring = digestWindow(Date.parse("2026-03-10T17:00:01Z"));
  assert.deepEqual(iso(spring), ["2026-03-03T18:00:00.000Z", "2026-03-10T17:00:00.000Z"]);
  assert.equal(digestWindow(Date.parse("2026-03-03T18:00:00Z")).endMs, spring.startMs);
});

test("inWindow: instants are [start, end); date-only by Pacific calendar day [start day, end day)", () => {
  assert.equal(inWindow(during, START, END), true);
  assert.equal(inWindow(before, START, END), false);
  assert.equal(inWindow(new Date(START).toISOString(), START, END), true);
  assert.equal(inWindow(new Date(END).toISOString(), START, END), false, "end instant belongs to next week");
  // Window runs Tue 11-17 10 AM → Tue 11-24 10 AM (Pacific).
  assert.equal(inWindow("2026-11-16", START, END), false);
  assert.equal(inWindow("2026-11-17", START, END), true, "last week's send day, possibly entered after that send");
  assert.equal(inWindow("2026-11-23", START, END), true);
  assert.equal(inWindow("2026-11-24", START, END), false, "send day rolls into next week");
  assert.equal(inWindow("", START, END), false);
  assert.equal(inWindow("not a date", START, END), false);
});

test("snippet strips HTML, decodes entities, truncates", () => {
  assert.equal(snippet("<p>Hi&nbsp;<b>there</b> &amp; you</p><p>next</p>"), "Hi there & you next");
  assert.equal(snippet("x".repeat(300), 10).length, 10);
});

test("ticketAssignee: OriginalAssignedTo wins; person-field lookup is the fallback", () => {
  assert.equal(ticketAssignee({ OriginalAssignedTo: "Me@X.com", AssignedToLookupId: "9" }, { 9: "other@x.com" }), "me@x.com");
  assert.equal(ticketAssignee({ AssignedToLookupId: "6" }, { 6: "me@x.com" }), "me@x.com");
  assert.equal(ticketAssignee({ AssignedToLookupId: "7" }, { 6: "me@x.com" }), "");
  assert.equal(ticketAssignee({}, {}), "");
});

test("ticketEvents: window-filtered, skips email_sent/comment_added log rows, merges comments sorted", () => {
  const activity = [
    { TicketId: "5", EventType: "ticket_status_changed", Title: 'Status changed from "New" to "In Progress"', ActorName: "Pat", Actor: "pat@x.com", Created: "2026-11-21T10:00:00Z" },
    { TicketId: "5", EventType: "email_sent", Title: "Email sent", Created: during },
    { TicketId: "5", EventType: "comment_added", Title: "Comment added", Created: during },
    { TicketId: "5", EventType: "ticket_priority_changed", Title: "old", Created: before },
    { TicketId: "6", EventType: "ticket_status_changed", Title: "other ticket", Created: during },
  ];
  const comments = [
    { TicketID: 5.0, Body: "<p>On it</p>", AuthorName: "Me", AuthorEmail: "me@x.com", Created: "2026-11-19T10:00:00Z" },
    { TicketID: 5.0, Body: "secret", IsInternal: true, OriginalAuthor: "Sam", Created: "2026-11-22T10:00:00Z" },
    { TicketID: 5.0, Body: "old", Created: before },
  ];
  const ev = ticketEvents("5", activity, comments, START, END);
  assert.deepEqual(
    ev.map((e) => [e.kind, e.text]),
    [
      ["comment", "On it"],
      ["activity", 'Status changed from "New" to "In Progress"'],
      ["internal", "secret"],
    ]
  );
  assert.equal(ev[2].actor, "Sam", "OriginalAuthor (inbound mail / API) beats createdBy");
});

test("buildTicketDigest: mine vs queue vs closed-this-week; others' and stale-closed excluded", () => {
  const tickets = [
    { id: "1", Title: "mine quiet", Status: "New", Priority: "Low", OriginalAssignedTo: "me@x.com" },
    { id: "2", Title: "mine busy", Status: "In Progress", Priority: "Low", OriginalAssignedTo: "me@x.com" },
    { id: "3", Title: "mine urgent quiet", Status: "On Hold", Priority: "Urgent", AssignedToLookupId: "6" },
    { id: "4", Title: "queue", Status: "New", Priority: "High", OriginalAssignedTo: "ITAV@x.com" },
    { id: "5", Title: "closed this week", Status: "Resolved", OriginalAssignedTo: "itav@x.com" },
    { id: "10", Title: "old closed, thank-you comment", Status: "Closed", OriginalAssignedTo: "me@x.com" },
    { id: "11", Title: "Kuma resolved by a person", Status: "Resolved", OriginalAssignedTo: "itav@x.com", ExternalRef: "kuma-14" },
    { id: "12", Title: "Vikunja-resolved", Status: "Resolved", OriginalAssignedTo: "me@x.com" },
    { id: "13", Title: "old closed, category edited", Status: "Closed", OriginalAssignedTo: "me@x.com" },
    { id: "14", Title: "old closed merge primary", Status: "Closed", OriginalAssignedTo: "me@x.com" },
    { id: "15", Title: "merged away (secondary)", Status: "Closed", OriginalAssignedTo: "me@x.com" },
    { id: "6", Title: "closed long ago", Status: "Closed", OriginalAssignedTo: "me@x.com" },
    { id: "7", Title: "someone else", Status: "New", OriginalAssignedTo: "ops@x.com" },
    { id: "8", Title: "Kuma blip", Status: "Closed", OriginalAssignedTo: "itav@x.com", ExternalRef: "kuma-12" },
    { id: "9", Title: "Kuma still down", Status: "New", Priority: "Normal", OriginalAssignedTo: "itav@x.com", ExternalRef: "kuma-13" },
  ];
  const activity = [
    { TicketId: "2", EventType: "ticket_assigned", Title: "Assigned", Created: during },
    { TicketId: "5", EventType: "ticket_status_changed", Title: "x", Details: '{"oldStatus":"New","newStatus":"Resolved"}', Created: during },
    { TicketId: "11", EventType: "ticket_status_changed", Title: 'Status changed from "New" to "Resolved"', Created: during },
    { TicketId: "13", EventType: "ticket_converted", Title: "Category changed", Details: '{"oldCategory":"Problem","newCategory":"Request"}', Created: during },
    { TicketId: "14", EventType: "ticket_merged", Title: "Ticket #15 merged into #14", Details: '{"secondaryId":"15","primaryId":"14"}', Created: during },
    { TicketId: "15", EventType: "ticket_merged", Title: "Ticket #15 merged into #14 and closed", Details: '{"secondaryId":"15","primaryId":"14"}', Created: during },
    { TicketId: "7", EventType: "ticket_status_changed", Title: "x", Created: during },
    { TicketId: "8", EventType: "StatusChanged", Title: "Ticket auto-closed after monitor recovery", Details: '{"from":"New","to":"Closed"}', Created: during },
  ];
  const comments = [
    { TicketID: 10, Body: "Thanks!", Created: during },
    { TicketID: 12, Body: "Resolved from Vikunja", CommentType: "Status Change", IsInternal: true, Created: during },
  ];
  const d = buildTicketDigest({ tickets, activity, comments, recipient: ME, siteUserEmailById: { 6: "me@x.com" }, startMs: START, endMs: END });
  // Changed first, then priority (Urgent before Low).
  assert.deepEqual(d.mine.map((t) => t.id), ["2", "3", "1"]);
  assert.equal(d.queues.length, 1);
  assert.equal(d.queues[0].address, "itav@x.com");
  // An open Kuma ticket still needs action, so it stays a normal queue row.
  assert.deepEqual(d.queues[0].open.map((t) => t.id), ["4", "9"]);
  // A comment on an old closed ticket isn't a closure; a person-resolved Kuma ticket
  // stays a full card; the Vikunja path closes via a Status Change comment.
  // A category change or being a merge's primary isn't a closure; the merged-away
  // secondary is.
  assert.deepEqual(d.closed.map((t) => t.id), ["15", "12", "11", "5"]);
  assert.deepEqual(d.monitorAlerts.map((t) => t.id), ["8"], "auto-closed Kuma blips are folded");
});

test("purchaseRoles: requester / approver / participant / thread-only; uninvolved is empty", () => {
  assert.deepEqual(purchaseRoles({ RequesterEmail: "ME@x.com", ApprovedByEmail: "me@x.com" }, "me@x.com"), ["Requester", "Approver"]);
  assert.deepEqual(purchaseRoles({ CreatedByEmail: "me@x.com" }, "me@x.com"), ["Requester"]);
  assert.deepEqual(purchaseRoles({ ParticipantEmails: "a@x.com; me@x.com" }, "me@x.com"), ["Participant"]);
  assert.deepEqual(purchaseRoles({ PurchaseThreadJSON: JSON.stringify([{ email: "me@x.com" }]) }, "me@x.com"), ["Thread"]);
  assert.deepEqual(purchaseRoles({ RequesterEmail: "a@x.com", PurchaseThreadJSON: "not json" }, "me@x.com"), []);
});

test("purchaseEvents: dated events inside the window only; Modified is ignored", () => {
  const f = {
    RequesterName: "Jo",
    ApprovalRequestedDate: before,
    ApprovalDate: "2026-11-19T20:00:00Z",
    ApprovalStatus: "Approved",
    PurchaseStatus: "Ordered",
    ApprovedByName: "MJ",
    PurchasedDate: "2026-11-20",
    PurchasedByEmail: "buyer@x.com",
    PurchaseLineItemsJSON: JSON.stringify([
      { name: "Cable", qty: 2, receivedDate: "2026-11-23", receivedQty: 2 },
      { name: "Old", qty: 1, receivedDate: "2026-11-01", receivedQty: 1 },
    ]),
    ReceivedDate: "2026-11-23",
    PurchaseThreadJSON: JSON.stringify([{ author: "Buyer", text: "Out of stock, OK to sub?", at: "2026-11-21T01:00:00Z" }]),
    Modified: during,
  };
  assert.deepEqual(
    purchaseEvents(f, START, END).map((e) => e.text),
    [
      "Approved by MJ",
      "Ordered by buyer@x.com",
      'Message from Buyer: "Out of stock, OK to sub?"',
      "Received: Cable (2 of 2)",
    ]
  );
  // Only a reminder stamp / Modified this week → nothing to report.
  assert.deepEqual(purchaseEvents({ ApprovalRequestedDate: before, Modified: during, LastReminderSent: during }, START, END), []);
});

test("purchaseEvents: a date-only receipt dated last Tuesday (after that send) is reported now", () => {
  const f = { PurchaseLineItemsJSON: JSON.stringify([{ name: "Cable", qty: 1, receivedDate: "2026-11-17", receivedQty: 1 }, null]) };
  assert.deepEqual(purchaseEvents(f, START, END).map((e) => e.text), ["Received: Cable (1 of 1)"]);
  // and a null line item doesn't break the total
  const out = buildPurchaseDigest({ purchases: [{ id: "9", RequesterEmail: "me@x.com", ...f }], email: "me@x.com", startMs: START, endMs: END });
  assert.equal(out.length, 1);
});

test("purchaseEvents: denied / cancelled wording", () => {
  const denied = purchaseEvents({ ApprovalDate: during, ApprovalStatus: "Denied", ApprovedByName: "MJ", ApprovalNotes: "<p>Not now</p>" }, START, END);
  assert.equal(denied[0].text, 'Denied by MJ — "Not now"');
  const cancelled = purchaseEvents({ CancelledDate: "2026-11-21", CancelledByName: "Jo", CancelReason: "dupe" }, START, END);
  assert.equal(cancelled[0].text, 'Cancelled by Jo — "dupe"');
});

test("buildPurchaseDigest: involved + changed only, most recent first", () => {
  const purchases = [
    { id: "1", Title: "A", RequesterEmail: "me@x.com", ApprovalDate: "2026-11-18T10:00:00Z" },
    { id: "2", Title: "B", RequesterEmail: "me@x.com", ApprovalDate: before },
    { id: "3", Title: "C", RequesterEmail: "other@x.com", ApprovalDate: during },
    { id: "4", Title: "D", ApprovedByEmail: "me@x.com", PurchasedDate: "2026-11-22", PurchaseLineItemsJSON: JSON.stringify([{ qty: 2, cost: 5 }]) },
  ];
  const out = buildPurchaseDigest({ purchases, email: "me@x.com", startMs: START, endMs: END });
  assert.deepEqual(out.map((p) => p.id), ["4", "1"]);
  assert.equal(out[0].total, 10);
  assert.deepEqual(out[0].roles, ["Approver"]);
});

test("weeklyDigestEmail: escapes content, links tickets, subject never carries 'Ticket #'", () => {
  const digest = {
    recipient: ME,
    startMs: START,
    endMs: END,
    tickets: {
      mine: [{ id: "432", title: "<script>x</script>", status: "In Progress", priority: "High", department: "Tech", created: before, events: [] }],
      queues: [{ address: "itav@x.com", open: [] }],
      closed: [],
      monitorAlerts: [{ id: "869", title: "Ring is DOWN", events: [] }],
    },
    purchases: [],
  };
  digest.tickets.mine[0].status = "<b>INJECTED</b>";
  digest.warnings = ["Couldn't look up <x>"];
  const { subject, html } = weeklyDigestEmail(digest, END);
  assert.ok(!html.includes("<b>INJECTED</b>") && html.includes("&lt;b&gt;INJECTED"), "status is escaped");
  assert.ok(html.includes("Couldn&#039;t look up &lt;x&gt;"), "warnings render, escaped");
  assert.ok(!/Ticket #\d/i.test(subject), "pollInboundReplies would attach replies to that ticket");
  assert.match(subject, /1 open, 0 closed, 0 purchase updates/);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("?ticket=432"));
  assert.ok(html.includes("Queue: itav@x.com"));
  assert.ok(html.includes("No changes this week"));
  assert.match(html, /Plus 1 monitor alert that Uptime Kuma auto-closed after the monitor recovered: <a [^>]*>#869 Ring is DOWN<\/a>/);
});
