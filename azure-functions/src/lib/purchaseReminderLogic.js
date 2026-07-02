// Pure decision logic for the daily purchase-reminder timer (purchaseReminders.js).
//
// Kept free of Graph/IO so it is unit-testable: every function takes an explicit
// `nowMs` instead of reading the clock. The timer maps each PurchaseRequests list
// item into a plain `req` object and asks reminderPlan() which nudges are due.
//
// Three reminder kinds (recipients resolved by the caller, not here):
//   - "approval": request still Pending approval → General Managers
//   - "order":    approved but an item isn't ordered yet → Purchasers
//   - "receive":  an ordered item hasn't been marked received → Inventory + requester
//
// Cadence: reminders normally repeat every 3 days. Once a request is inside the
// need-by window (needByDate within 9 days, per the requested "9 days in advance"
// rule) the cadence tightens to daily, and the approval/order nudges kick in even
// before the 4-day pending threshold.

const DAY_MS = 86400000;
const NEED_BY_WINDOW_DAYS = 9;
const PENDING_NUDGE_DAYS = 4;
const RECEIVE_NUDGE_DAYS = 7;

// Whole/fractional days elapsed since an ISO timestamp, or null if unparseable.
function daysSince(iso, nowMs) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / DAY_MS;
}

// Days from now until an ISO date (negative once past), or null if unparseable.
function daysUntil(iso, nowMs) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - nowMs) / DAY_MS;
}

// Inside the need-by window: a need-by date exists and is <= 9 days out (including
// already past — an overdue need-by is still urgent).
function inNeedByWindow(needByDate, nowMs) {
  const d = daysUntil(needByDate, nowMs);
  return d != null && d <= NEED_BY_WINDOW_DAYS;
}

function isOrdered(item) {
  return Boolean(item && item.vendor && String(item.vendor).trim());
}

function isFullyReceived(item) {
  return Boolean(item.receivedDate) && (item.receivedQty || 0) >= (item.qty || 0);
}

function hasUnorderedItem(items) {
  return items.some((i) => !isOrdered(i));
}

function hasOrderedUnreceivedItem(items) {
  return items.some((i) => isOrdered(i) && !isFullyReceived(i));
}

// A receive nudge is due when some ordered-unreceived item's expected delivery has
// passed, or (lacking that) it's been >= 7 days since the order was placed. orderedAt
// is the record-level order timestamp proxy (purchasedDate || modified) the caller
// supplies, since line items carry no per-item ordered-on stamp.
function receiveDue(items, orderedAt, nowMs) {
  for (const item of items) {
    if (!isOrdered(item) || isFullyReceived(item)) continue;
    const untilDelivery = daysUntil(item.expectedDelivery, nowMs);
    if (untilDelivery != null && untilDelivery <= 0) return true;
    if (untilDelivery == null) {
      const since = daysSince(orderedAt, nowMs);
      if (since != null && since >= RECEIVE_NUDGE_DAYS) return true;
    }
  }
  return false;
}

// req: {
//   approvalStatus, needByDate, approvalRequestedDate,
//   lineItems: [{vendor, orderNum, qty, receivedDate, receivedQty, expectedDelivery}],
//   orderedAt   // purchasedDate || modified
// }
// Returns { cadenceDays, reminders: Array<"approval"|"order"|"receive"> } — the
// nudges due right now, ignoring throttle (the caller gates on shouldSend()).
function reminderPlan(req, nowMs) {
  const items = Array.isArray(req.lineItems) ? req.lineItems : [];
  const win = inNeedByWindow(req.needByDate, nowMs);
  const cadenceDays = win ? 1 : 3;
  const reminders = [];

  if (req.approvalStatus === "Pending") {
    const pendingDays = daysSince(req.approvalRequestedDate, nowMs);
    if (win || (pendingDays != null && pendingDays > PENDING_NUDGE_DAYS)) {
      reminders.push("approval");
    }
  }

  // Order nudge: an approved request with something still unordered, but only inside
  // the need-by window — approved requests already surface in the /orders queue, so
  // we only actively email purchasers when a deadline is approaching.
  if (req.approvalStatus === "Approved" && win && hasUnorderedItem(items)) {
    reminders.push("order");
  }

  if (hasOrderedUnreceivedItem(items) && receiveDue(items, req.orderedAt, nowMs)) {
    reminders.push("receive");
  }

  return { cadenceDays, reminders };
}

// Throttle gate: send if never reminded, or the cadence interval has elapsed since
// the last reminder. An unparseable/absent stamp means "send".
function shouldSend(lastReminderSent, cadenceDays, nowMs) {
  const since = daysSince(lastReminderSent, nowMs);
  if (since == null) return true;
  return since >= cadenceDays;
}

module.exports = {
  reminderPlan,
  shouldSend,
  inNeedByWindow,
  receiveDue,
  hasUnorderedItem,
  hasOrderedUnreceivedItem,
  DAY_MS,
};
