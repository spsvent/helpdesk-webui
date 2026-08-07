// Decides when an Uptime Kuma ticket has earned an automatic close. Pure — no I/O.
//
// The lifecycle: a DOWN webhook opens a ticket carrying ExternalRef=kuma-<monitorId>.
// When Kuma reports the monitor UP again, CreateTicket stamps ExternalRecoveredAt on
// that ticket instead of closing it — a host that flaps back down ten minutes later
// shouldn't have its ticket disappear, and a re-DOWN clears the stamp. A timer sweep
// then closes tickets whose monitor has stayed up for the hold window.
//
// Two guards keep this from closing work out from under people:
//   - only Status "New" tickets (nobody has picked it up)
//   - only tickets with no human comment (a tech replying by email or in the app
//     counts as engagement even if they never moved the status)

const KUMA_REF_PREFIX = "kuma-";
// Comments written by the intake API carry this author; anything else — a comment
// from the web app (OriginalAuthor unset, real user in createdBy) or an emailed
// reply (OriginalAuthor = the sender) — means a person has engaged with the ticket.
const API_AUTHOR = "API";

function hasHumanActivity(comments) {
  for (const c of comments || []) {
    const f = (c && c.fields) || {};
    if (String(f.OriginalAuthor || "") !== API_AUTHOR) return true;
  }
  return false;
}

// Returns { close, reason }. `reason` is carried into the logs so a ticket that
// didn't close is explainable without re-deriving the state by hand.
function autoCloseDecision(item, comments, nowMs, holdMinutes) {
  const f = (item && item.fields) || {};
  if (!String(f.ExternalRef || "").startsWith(KUMA_REF_PREFIX)) return { close: false, reason: "not-a-kuma-ticket" };
  if (String(f.Status || "") !== "New") return { close: false, reason: "status-not-new" };

  const recoveredMs = Date.parse(f.ExternalRecoveredAt || "");
  if (Number.isNaN(recoveredMs)) return { close: false, reason: "still-down" };

  const holdMs = Number(holdMinutes) * 60 * 1000;
  // A non-positive hold would close tickets the instant Kuma reports UP, which is
  // exactly the flapping behaviour the stamp exists to avoid — treat it as disabled.
  if (!(holdMs > 0)) return { close: false, reason: "auto-close-disabled" };
  if (nowMs - recoveredMs < holdMs) return { close: false, reason: "within-hold-window" };

  if (hasHumanActivity(comments)) return { close: false, reason: "human-activity" };
  return { close: true, reason: "recovered", recoveredMs };
}

module.exports = { KUMA_REF_PREFIX, API_AUTHOR, hasHumanActivity, autoCloseDecision };
