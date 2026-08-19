// Self-notification suppression.
//
// You don't need an email telling you about a change you just made. Every send
// path therefore carries the *actor* (the person whose click produced the mail)
// alongside the recipient, and we drop the send when they're the same address.
//
// Scope, deliberately: this only matches individual addresses. When a ticket is
// assigned to a shared/Microsoft 365 group address, one message goes to the group
// and lands in every member's inbox — Graph offers no per-recipient suppression
// there, and expanding the group into N individual sends would break the shared
// queue's reply semantics. Group-addressed mail is left alone; use an Outlook
// rule if it's noisy. See also optOut.js, which suppresses by *recipient*
// regardless of who acted.

const norm = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");

// True when this mail is just telling the actor about their own action.
function isSelfNotification(recipient, actorEmail) {
  const a = norm(actorEmail);
  return a.length > 0 && norm(recipient) === a;
}

// Drop the actor from a recipient list. Returns a new array; order preserved.
function excludeActor(recipients, actorEmail) {
  const a = norm(actorEmail);
  if (!a) return [...(recipients || [])];
  return (recipients || []).filter((r) => norm(r) !== a);
}

// Same, for group-member records ({ email, displayName }) from getGroupMembers.
function excludeActorMembers(members, actorEmail) {
  const a = norm(actorEmail);
  if (!a) return [...(members || [])];
  return (members || []).filter((m) => norm(m && m.email) !== a);
}

module.exports = { isSelfNotification, excludeActor, excludeActorMembers };
