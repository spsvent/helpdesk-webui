// Recipient notification opt-out.
//
// Emails listed on the NotificationOptOut SharePoint list are suppressed from
// ALL help desk notification email. This is delivery-only: an opted-out person
// keeps every bit of their app access and RBAC role (GM, Purchaser, etc.) — we
// simply never send support-desk email to their address. It exists because a
// person's notifications are otherwise coupled to their role-group membership,
// so there's no way to stop the mail by editing groups without also removing
// access. Admins manage the list from Settings → Notification Opt-Out.
//
// Enforced server-side at every send chokepoint (graphHelpers.sendMail, the
// SendEmail HTTP function, and checkEscalations) so no notification path can
// bypass it.

const OPTOUT_TTL_MS = 60 * 1000; // cache the list for a minute across sends

// Module-level cache, shared by every function in this app process.
let cache = { at: 0, set: new Set() };

function siteId() {
  return process.env.SHAREPOINT_SITE_ID;
}
function listId() {
  return process.env.NOTIFICATION_OPTOUT_LIST_ID;
}

// Returns a lowercased Set of opted-out email addresses. Cached for OPTOUT_TTL_MS
// so a fan-out that calls sendMail() per recipient hits SharePoint at most once.
// Fails open: if the list can't be read we return the last known set (empty on a
// cold failure) so a transient SharePoint blip never blocks real notifications.
async function getOptOutEmails(client) {
  if (!listId()) return new Set(); // feature not configured -> suppress nobody
  const now = Date.now();
  if (now - cache.at < OPTOUT_TTL_MS) return cache.set;
  try {
    const endpoint = `/sites/${siteId()}/lists/${listId()}/items?$expand=fields&$top=500`;
    const res = await client.api(endpoint).get();
    const set = new Set();
    for (const item of res.value || []) {
      const f = item.fields || {};
      if (f.IsActive === false) continue; // an admin can disable without deleting
      const email = String(f.Email || f.Title || "").trim().toLowerCase();
      if (email.includes("@")) set.add(email);
    }
    cache = { at: now, set };
    return set;
  } catch (e) {
    console.error("getOptOutEmails failed:", e.message);
    return cache.set; // last known (empty if never loaded)
  }
}

// True if `email` is on the opt-out set. `set` comes from getOptOutEmails().
function isSuppressed(email, set) {
  if (!email || !set || set.size === 0) return false;
  return set.has(String(email).trim().toLowerCase());
}

// Convenience for callers that hold a list of recipients: returns only those that
// should still receive mail. Accepts a string or array; always returns an array.
async function filterRecipients(client, to) {
  const list = Array.isArray(to) ? to : [to];
  const set = await getOptOutEmails(client);
  return list.filter((addr) => addr && !isSuppressed(addr, set));
}

module.exports = { getOptOutEmails, isSuppressed, filterRecipients };
