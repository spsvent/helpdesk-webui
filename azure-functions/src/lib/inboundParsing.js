// Pure helpers for inbound mail processing. No I/O — unit-testable.

// Extract the ticket id from a reply subject like "RE: [Update] Ticket #230: x".
// Outbound subjects always contain "Ticket #<id>" and replies preserve it.
function parseTicketId(subject) {
  if (!subject || typeof subject !== "string") return null;
  const m = subject.match(/Ticket #(\d+)/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return id > 0 ? id : null;
}

// Detect auto-replies / out-of-office so our re-notification can't trigger a loop.
function isAutoReply(message) {
  if (!message) return false;
  const subject = (message.subject || "").toLowerCase();
  if (
    subject.startsWith("automatic reply:") ||
    subject.startsWith("auto:") ||
    subject.includes("out of office")
  ) {
    return true;
  }
  const headers = message.internetMessageHeaders || [];
  for (const h of headers) {
    const name = (h.name || "").toLowerCase();
    const value = (h.value || "").toLowerCase();
    if (name === "auto-submitted" && value && value !== "no") return true;
    if (name === "x-auto-response-suppress" && value) return true;
    if (name === "precedence" && (value === "bulk" || value === "auto_reply")) return true;
  }
  return false;
}

// Strip HTML tags + decode a few common entities -> plain text. uniqueBody is requested
// as text, so this is usually a near no-op; it's a safety net if HTML comes back.
function htmlToText(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = { parseTicketId, isAutoReply, htmlToText };
