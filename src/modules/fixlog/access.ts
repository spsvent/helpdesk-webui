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

/**
 * Edit / delete an entry (and its photos): whoever created it, or an admin.
 * Identity comes from SharePoint's immutable creator; LoggedByEmail is only the
 * fallback when Graph omits the creator's email. SharePoint enforces the same rule
 * natively (item-level "edit own items only" on the QuickFixLog list), so this
 * just keeps the buttons honest.
 */
export function canModifyEntry(
  entry: Pick<FixLogEntry, "loggedByEmail" | "createdByEmail">,
  perms: UserPermissions | null
): boolean {
  if (!perms) return false;
  if (perms.role === "admin") return true;
  const owner = (entry.createdByEmail || entry.loggedByEmail || "").toLowerCase();
  return !!owner && owner === perms.email.toLowerCase();
}

/** Retention cleanup (delete old photos / names / entries in bulk): admins only. */
export function canRunCleanup(perms: UserPermissions | null): boolean {
  return perms?.role === "admin";
}
