// RBAC Service - Permission logic and group membership queries
import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import {
  UserPermissions,
  createAdminPermissions,
  createSupportPermissions,
  createUserPermissions,
} from "@/types/rbac";
import {
  isHardcodedAdmin,
  ADMIN_EMAILS,
} from "./rbacConfig";
import {
  fetchRBACConfig,
  filterAllowedGroups,
  getVisibilityGroupIds,
  hasElevatedPermissions,
  RBACConfig,
} from "./rbacConfigService";

interface GraphMemberOfResponse {
  value: Array<{
    id: string;
    "@odata.type": string;
    displayName?: string;
  }>;
}

// Cached RBAC config
let rbacConfig: RBACConfig | null = null;

/**
 * Initialize/fetch the RBAC configuration from SharePoint
 */
export async function initRBACConfig(client: Client): Promise<RBACConfig> {
  if (!rbacConfig) {
    rbacConfig = await fetchRBACConfig(client);
  }
  return rbacConfig;
}

/**
 * Fetch the current user's group memberships from Microsoft Graph
 * Filters to only include allowed groups from RBAC config
 */
export async function getUserGroupMemberships(client: Client): Promise<string[]> {
  try {
    // Ensure RBAC config is loaded
    const config = await initRBACConfig(client);

    // Use memberOf to get all groups the user belongs to
    const response: GraphMemberOfResponse = await client
      .api("/me/memberOf")
      .select("id,displayName")
      .get();

    // Filter to only include groups (not roles or other directory objects)
    const allGroupIds = response.value
      .filter((item) => item["@odata.type"] === "#microsoft.graph.group")
      .map((group) => group.id);

    // Filter to only allowed groups
    return filterAllowedGroups(allGroupIds, config);
  } catch (error) {
    console.error("Failed to fetch group memberships:", error);
    return [];
  }
}

/**
 * Get the full permissions object for a user
 */
export async function getUserPermissions(
  client: Client,
  email: string,
  displayName: string
): Promise<UserPermissions> {
  // Check if hardcoded admin first (no need to fetch groups)
  if (isHardcodedAdmin(email)) {
    return createAdminPermissions(email, displayName, []);
  }

  // Fetch RBAC config and group memberships
  const config = await initRBACConfig(client);
  const groupIds = await getUserGroupMemberships(client);

  // Check if admin group member
  if (groupIds.some((id) => config.adminGroupIds.has(id))) {
    return createAdminPermissions(email, displayName, groupIds);
  }

  // Check if support staff (member of any department group)
  if (groupIds.some((id) => config.departmentGroupIds.has(id))) {
    const departments = getDepartmentsForGroupsFromConfig(groupIds, config);
    const subtypeRestrictions = getSubtypeRestrictionsFromConfig(groupIds, config);

    return createSupportPermissions(
      email,
      displayName,
      groupIds,
      departments,
      subtypeRestrictions
    );
  }

  // Regular user - store only visibility groups for ticket sharing
  const visibilityGroupIds = getVisibilityGroupIds(groupIds, config);
  return createUserPermissions(email, displayName, visibilityGroupIds);
}

/**
 * Get departments a user can edit based on config
 */
function getDepartmentsForGroupsFromConfig(
  groupIds: string[],
  config: RBACConfig
): string[] {
  const departments: string[] = [];
  for (const groupId of groupIds) {
    const dept = config.groupIdToDepartment.get(groupId);
    if (dept && !departments.includes(dept)) {
      departments.push(dept);
    }
  }
  return departments;
}

/**
 * Get subtype restrictions based on config
 */
function getSubtypeRestrictionsFromConfig(
  groupIds: string[],
  config: RBACConfig
): Array<{ problemType: string; problemTypeSub: string }> {
  const restrictions: Array<{ problemType: string; problemTypeSub: string }> = [];
  for (const groupId of groupIds) {
    const subtype = config.groupIdToSubtype.get(groupId);
    if (subtype) {
      restrictions.push(subtype);
    }
  }
  return restrictions;
}

/**
 * Check if a user can edit a specific ticket
 */
export function canEditTicket(
  permissions: UserPermissions,
  ticket: Ticket
): boolean {
  // Admins can edit all tickets
  if (permissions.role === "admin") {
    return true;
  }

  // Regular users can only edit their own tickets
  if (permissions.role === "user") {
    return isOwnTicket(permissions, ticket);
  }

  // Support staff - check department or subtype match
  if (permissions.role === "support") {
    // Check subtype restrictions first (more specific)
    if (permissions.subtypeRestrictions.length > 0) {
      for (const restriction of permissions.subtypeRestrictions) {
        if (
          ticket.problemType === restriction.problemType &&
          ticket.problemTypeSub === restriction.problemTypeSub
        ) {
          return true;
        }
      }
    }

    // Check department match
    if (permissions.editableDepartments.includes(ticket.problemType)) {
      // If user also has subtype restrictions for this department,
      // they might be limited to only those subtypes
      const subtypeRestrictionsForDept = permissions.subtypeRestrictions.filter(
        (r) => r.problemType === ticket.problemType
      );

      // If they have subtype restrictions for this department, check if ticket matches
      if (subtypeRestrictionsForDept.length > 0) {
        return subtypeRestrictionsForDept.some(
          (r) => ticket.problemTypeSub === r.problemTypeSub
        );
      }

      // No subtype restrictions - can edit all tickets in department
      return true;
    }

    // Check if "Other" department - any support staff can edit
    if (ticket.problemType === "Other" && permissions.canEditOtherDepartment) {
      return true;
    }

    // Check if user has ONLY subtype restrictions (no full department access)
    // and the ticket matches one of their subtypes
    const matchingSubtype = permissions.subtypeRestrictions.find(
      (r) =>
        r.problemType === ticket.problemType &&
        r.problemTypeSub === ticket.problemTypeSub
    );
    if (matchingSubtype) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the ticket creator has elevated permissions (admin/support)
 * If so, their tickets should not be visible to regular users via group sharing
 */
export function isCreatorElevated(ticket: Ticket): boolean {
  const creatorEmail = ticket.createdBy?.email || ticket.originalRequester || ticket.requester?.email;

  if (!creatorEmail) return false;

  // Check if creator is a hardcoded admin
  if (ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === creatorEmail.toLowerCase()
  )) {
    return true;
  }

  // Note: We can't check group memberships here without async calls
  // For a more complete check, we'd need to maintain a list of elevated user emails
  // For now, we rely on the hardcoded admin list
  // TODO: Consider adding "elevated users" list to SharePoint for runtime checking

  return false;
}

/**
 * Check if a user can view a specific ticket
 */
export function canViewTicket(
  permissions: UserPermissions,
  ticket: Ticket,
  groupMemberEmails?: string[]
): boolean {
  // Admins and support staff can see all tickets
  if (permissions.canSeeAllTickets) {
    return true;
  }

  // Regular users can see their own tickets
  if (isOwnTicket(permissions, ticket)) {
    return true;
  }

  // Regular users can see tickets from members of their groups
  // BUT NOT if the ticket creator has elevated permissions (admin/support)
  if (groupMemberEmails && groupMemberEmails.length > 0) {
    // Skip group-based visibility if creator is admin/support
    if (isCreatorElevated(ticket)) {
      return false;
    }

    const requesterEmail = ticket.originalRequester || ticket.requester.email;
    if (
      groupMemberEmails.some(
        (email) => email.toLowerCase() === requesterEmail.toLowerCase()
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a ticket belongs to the current user
 */
export function isOwnTicket(permissions: UserPermissions, ticket: Ticket): boolean {
  const requesterEmail = ticket.originalRequester || ticket.requester.email;
  return (
    requesterEmail.toLowerCase() === permissions.email.toLowerCase() ||
    ticket.createdBy.email.toLowerCase() === permissions.email.toLowerCase()
  );
}

/**
 * Check if user can add comments to a ticket
 */
export function canAddComment(
  permissions: UserPermissions,
  ticket: Ticket
): boolean {
  // Admins can always add comments
  if (permissions.role === "admin") {
    return true;
  }

  // Support staff can add comments to any ticket (they can see all)
  if (permissions.role === "support") {
    return true;
  }

  // Regular users can only add comments to their own tickets
  return isOwnTicket(permissions, ticket);
}

/**
 * Check if user can delete a ticket
 */
export function canDeleteTicket(permissions: UserPermissions): boolean {
  return permissions.canDelete;
}

/**
 * Get list of all users in the user's groups (for ticket visibility)
 * This requires additional Graph API calls to list group members
 * Only fetches members from visibility groups (not department/admin groups)
 */
export async function getGroupMemberEmails(client: Client, groupIds: string[]): Promise<string[]> {
  const emails: string[] = [];
  const config = rbacConfig;

  // If config not loaded, groupIds should already be filtered visibility groups
  // from getUserPermissions, so we can use them directly
  let relevantGroupIds = groupIds;

  // If config is available, filter out elevated groups
  if (config) {
    relevantGroupIds = groupIds.filter(
      (id) => !config.elevatedGroupIds.has(id)
    );
  }

  for (const groupId of relevantGroupIds) {
    try {
      const response = await client
        .api(`/groups/${groupId}/members`)
        .select("mail,userPrincipalName")
        .get();

      for (const member of response.value) {
        const email = member.mail || member.userPrincipalName;
        if (email && !emails.includes(email.toLowerCase())) {
          emails.push(email.toLowerCase());
        }
      }
    } catch (error) {
      console.error(`Failed to fetch members for group ${groupId}:`, error);
    }
  }

  return emails;
}

/**
 * Check if a support user can only edit specific subtypes (not full department)
 */
export function hasOnlySubtypeAccess(
  permissions: UserPermissions,
  problemType: string
): boolean {
  if (permissions.role !== "support") {
    return false;
  }

  // If they have full department access, return false
  if (permissions.editableDepartments.includes(problemType)) {
    return false;
  }

  // Check if they have subtype restrictions for this department
  return permissions.subtypeRestrictions.some(
    (r) => r.problemType === problemType
  );
}
