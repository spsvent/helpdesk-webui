// Who may create / edit a CDW brief. Pure + env-driven so it's testable and so the
// manifest's visibleWhen can reuse it.

import type { UserPermissions } from "@/types/rbac";

// Optional Entra group whose members may create CDWs (e.g. the marketing/creative
// team). Read inside the function so it's overridable in tests; Next inlines the
// NEXT_PUBLIC_* access at build time.
function requestersGroupId(): string {
  return process.env.NEXT_PUBLIC_CDW_REQUESTERS_GROUP_ID || "";
}

/**
 * Can this user create / submit a CDW brief?
 * - Admins always can.
 * - If NEXT_PUBLIC_CDW_REQUESTERS_GROUP_ID is set, only members of that group can
 *   (the precise knob — point it at the marketing/creative team).
 * - Otherwise it falls back to staff (role "support"), so it is never open to every
 *   signed-in user.
 */
export function canCreateCdw(perms: UserPermissions | null): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  const group = requestersGroupId();
  if (group) return (perms.groupMemberships || []).includes(group);
  return perms.role === "support";
}

/** Can this user edit an existing brief? The brief's owner (creator/requester) or an admin. */
export function canEditCdw(
  brief: { createdByEmail: string; requesterEmail: string },
  perms: UserPermissions | null
): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  const me = perms.email.toLowerCase();
  return [brief.createdByEmail, brief.requesterEmail].some((e) => e && e.toLowerCase() === me);
}
