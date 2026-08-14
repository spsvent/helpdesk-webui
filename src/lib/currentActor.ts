// The signed-in user's email, for self-notification suppression.
//
// Every notification the SPA sends is the result of something the signed-in user
// just did, so by default we never email that change back to them — they were
// looking at the screen when they made it. `sendEmail` reads this as the default
// actor, which means new notification paths get the behavior for free instead of
// each call site having to remember to filter.
//
// Set from layout.tsx wherever an MSAL account becomes active. Server-side has the
// mirror of this in azure-functions/src/lib/selfNotify.js.

let currentActorEmail = "";

export function setCurrentActor(email?: string | null): void {
  currentActorEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function getCurrentActor(): string {
  return currentActorEmail;
}

export function isCurrentActor(email?: string | null): boolean {
  if (!currentActorEmail) return false;
  return typeof email === "string" && email.trim().toLowerCase() === currentActorEmail;
}
