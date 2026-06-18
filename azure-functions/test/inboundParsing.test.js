const { test } = require("node:test");
const assert = require("node:assert");
const { parseTicketId, isAutoReply, htmlToText } = require("../src/lib/inboundParsing");

test("parseTicketId extracts the id from reply subjects", () => {
  assert.strictEqual(parseTicketId("RE: [Update] Ticket #230: Printer"), 230);
  assert.strictEqual(parseTicketId("[Approval Required] Ticket #42: x"), 42);
  assert.strictEqual(parseTicketId("Fwd: ticket #7 follow-up"), 7); // case-insensitive
  assert.strictEqual(parseTicketId("no ticket here"), null);
  assert.strictEqual(parseTicketId("Ticket #0: weird"), null);
  assert.strictEqual(parseTicketId(undefined), null);
});

test("isAutoReply detects OOO and auto-submitted", () => {
  assert.strictEqual(isAutoReply({ subject: "Automatic reply: Ticket #230" }), true);
  assert.strictEqual(isAutoReply({ subject: "RE: Ticket #230", internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-replied" }] }), true);
  assert.strictEqual(isAutoReply({ subject: "RE: Ticket #230", internetMessageHeaders: [{ name: "Precedence", value: "bulk" }] }), true);
  assert.strictEqual(isAutoReply({ subject: "RE: Ticket #230", internetMessageHeaders: [{ name: "Auto-Submitted", value: "no" }] }), false);
  assert.strictEqual(isAutoReply({ subject: "RE: Ticket #230" }), false);
  assert.strictEqual(isAutoReply(null), false);
});

test("htmlToText strips tags and decodes entities", () => {
  assert.strictEqual(htmlToText("<p>Hello</p><p>World</p>"), "Hello\nWorld");
  assert.strictEqual(htmlToText("a<br>b"), "a\nb");
  assert.strictEqual(htmlToText("Tom &amp; Jerry &lt;3"), "Tom & Jerry <3");
  assert.strictEqual(htmlToText("  plain text  "), "plain text");
  assert.strictEqual(htmlToText(""), "");
});
