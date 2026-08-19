// Pure input-validation + dedup helpers for the create-ticket API. No I/O — unit-testable.

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
// Canonical ProblemType (department) list — the app's live set from
// src/lib/categoryConfig.ts (CATEGORY_HIERARCHY keys), NOT the SharePoint Category
// column's stale choices. Drives auto-assignment routing, so validate against it.
// Keep in sync with categoryConfig.ts if departments change.
const PROBLEM_TYPES = [
  "Tech",
  "Operations",
  "Facilities",
  "Marketing",
  "HR",
  "Customer Service",
  "Inventory",
  "Finance",
  "Food & Beverage",
  "Campground",
  "Retail",
  "Safety",
  "Other",
];
// A ticket still "open" for dedup purposes = anything not in a terminal state.
const CLOSED_STATUSES = new Set(["Resolved", "Closed", "Cancelled"]);
// Every repeat-alert comment opens with this, so we can spot the previous one.
const REPEAT_COMMENT_PREFIX = "Repeat alert";

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

// Validate + normalize the POST body. Returns { ok, errors, value }.
// v1 supports "Problem" tickets only — "Request" tickets need the GM approval
// flow (token mint + approver email), which the web app owns; that's a follow-up.
function validateCreateTicketInput(body) {
  const errors = [];
  const b = body && typeof body === "object" ? body : {};

  const title = trimStr(b.title);
  const description = trimStr(b.description);
  const problemType = trimStr(b.problemType);
  if (!title) errors.push("title is required");
  if (!description) errors.push("description is required");
  if (!problemType) errors.push("problemType is required");
  else if (!PROBLEM_TYPES.includes(problemType)) {
    errors.push(`problemType must be one of: ${PROBLEM_TYPES.join(", ")}`);
  }

  const category = trimStr(b.category) || "Problem";
  if (category !== "Problem") {
    errors.push("category must be 'Problem' (Request tickets aren't supported via the API yet)");
  }

  let priority = trimStr(b.priority) || "Normal";
  if (!PRIORITIES.includes(priority)) {
    errors.push(`priority must be one of: ${PRIORITIES.join(", ")}`);
  }

  const value = {
    title,
    description,
    problemType,
    category: "Problem",
    priority: PRIORITIES.includes(priority) ? priority : "Normal",
    problemTypeSub: trimStr(b.problemTypeSub) || undefined,
    problemTypeSub2: trimStr(b.problemTypeSub2) || undefined,
    location: trimStr(b.location) || undefined,
    requesterEmail: trimStr(b.requesterEmail) || undefined,
    assigneeEmail: trimStr(b.assigneeEmail) || undefined,
    source: trimStr(b.source) || undefined,
    externalRef: trimStr(b.externalRef) || undefined,
  };
  return { ok: errors.length === 0, errors, value };
}

function isOpenStatus(status) {
  return !CLOSED_STATUSES.has(String(status || ""));
}

// Among existing Tickets-list items (each with .fields.ExternalRef and .fields.Status),
// return the first still-open ticket carrying this externalRef, or null. Used so a
// flapping alert comments on its existing ticket instead of spawning duplicates.
function findOpenDuplicate(items, externalRef) {
  if (!externalRef) return null;
  for (const it of items || []) {
    const f = (it && it.fields) || {};
    if (f.ExternalRef === externalRef && isOpenStatus(f.Status)) return it;
  }
  return null;
}

// A monitor that re-fires every few minutes folds onto one ticket, but each repeat
// still appends an identical ping dump — enough of them and the thread is unreadable.
// Suppress the comment if another repeat note already landed within the throttle
// window. `comments` are Tickets-comment list items; timestamp comes from
// fields.Created, falling back to the item-level createdDateTime Graph always sends.
// Unparseable/absent timestamps don't throttle (fail open — better a noisy comment
// than a silently swallowed alert).
function isRepeatCommentThrottled(comments, nowMs, throttleMinutes) {
  const windowMs = Number(throttleMinutes) * 60 * 1000;
  if (!(windowMs > 0)) return false;
  for (const c of comments || []) {
    const f = (c && c.fields) || {};
    if (!String(f.Body || "").startsWith(REPEAT_COMMENT_PREFIX)) continue;
    const t = Date.parse(f.Created || (c && c.createdDateTime) || "");
    if (!Number.isNaN(t) && nowMs - t < windowMs) return true;
  }
  return false;
}

module.exports = {
  PRIORITIES,
  PROBLEM_TYPES,
  REPEAT_COMMENT_PREFIX,
  validateCreateTicketInput,
  isOpenStatus,
  findOpenDuplicate,
  isRepeatCommentThrottled,
};
