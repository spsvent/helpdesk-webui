// Pure request-hardening helpers for the approval-request trigger functions,
// split out so they can be unit-tested without pulling in @azure/functions.

// How long after a successful send we refuse to email the approver group again
// for the same item (blunts email-bomb / approval-fatigue loops).
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Strict SharePoint list-item id check. The id is interpolated into a Graph API
 * path, so only accept a plain decimal integer (no signs, dots, path segments).
 * @param {unknown} id
 * @returns {boolean}
 */
function isValidItemId(id) {
  return /^\d{1,10}$/.test(String(id ?? ""));
}

/**
 * Whether a re-send cooldown stamp is still active.
 *
 * A missing/unparseable stamp means "no cooldown" (tolerates lists created
 * before the stamp column existed). A future-dated stamp counts as active —
 * the column is only ever server-written, so skew can't lock an item out for
 * longer than the window plus the skew itself.
 *
 * @param {string|null|undefined} stampIso ISO datetime of the last send
 * @param {number} [nowMs] current time (ms since epoch), defaults to Date.now()
 * @param {number} [windowMs] cooldown window, defaults to RESEND_COOLDOWN_MS
 * @returns {boolean}
 */
function isWithinCooldown(stampIso, nowMs = Date.now(), windowMs = RESEND_COOLDOWN_MS) {
  if (!stampIso) return false;
  const t = Date.parse(stampIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t < windowMs;
}

module.exports = { RESEND_COOLDOWN_MS, isValidItemId, isWithinCooldown };
