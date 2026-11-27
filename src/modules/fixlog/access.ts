// Who may use the Quick Fix Log. Pure so the manifest's visibleWhen and the tests
// share one definition.
//
// The SharePoint lists themselves are also locked to the IT group + admins
// (provision script), so this gate matches what the user can actually read.

import type { UserPermissions } from "@/types/rbac";
import { FIXLOG_DEPARTMENT, type FixLogEntry } from "./types";

/** IT only: admins, or support staff whose editable departments include Tech. */
export function canUseFixLog(perms: UserPermissions | null): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  return (perms.editableDepartments || []).includes(FIXLOG_DEPARTMENT);
}

/** Edit / delete an entry (and its photos): whoever logged it, or an admin. */
export function canModifyEntry(
  entry: Pick<FixLogEntry, "loggedByEmail">,
  perms: UserPermissions | null
): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  return !!entry.loggedByEmail && entry.loggedByEmail.toLowerCase() === perms.email.toLowerCase();
}

/** Retention cleanup (delete old photos / names / entries in bulk): admins only. */
export function canRunCleanup(perms: UserPermissions | null): boolean {
  return perms?.role === "admin";
}
