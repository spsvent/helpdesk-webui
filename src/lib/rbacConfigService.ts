// RBAC Configuration Service - Fetches RBAC settings from SharePoint
import { Client } from "@microsoft/microsoft-graph-client";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const RBAC_GROUPS_LIST_ID = process.env.NEXT_PUBLIC_RBAC_GROUPS_LIST_ID || "";

// Types for RBAC groups from SharePoint
export interface RBACGroup {
  id: string;
  title: string;
  groupId: string; // Entra group ID
  groupType: "visibility" | "department" | "admin" | "purchaser" | "inventory";
  department?: string; // ProblemType this group can edit
  problemTypeSub?: string; // Sub-type restriction (e.g., "POS")
  isActive: boolean;
}

export interface RBACConfig {
  // All allowed groups (only these are considered for RBAC)
  allowedGroupIds: Set<string>;

  // Groups by type
  visibilityGroups: RBACGroup[]; // For regular user ticket sharing
  departmentGroups: RBACGroup[]; // For support staff editing
  adminGroups: RBACGroup[]; // Admin groups
  purchaserGroups: RBACGroup[]; // Purchase workflow - can mark as purchased
  inventoryGroups: RBACGroup[]; // Purchase workflow - can mark as received

  // Lookup maps for quick access
  groupIdToDepartment: Map<string, string>;
  groupIdToSubtype: Map<string, { problemType: string; problemTypeSub: string }>;
  departmentGroupIds: Set<string>;
  adminGroupIds: Set<string>;
  purchaserGroupIds: Set<string>;
  inventoryGroupIds: Set<string>;

  // All elevated group IDs (admin + department + purchaser + inventory)
  elevatedGroupIds: Set<string>;
}

interface SharePointRBACGroupItem {
  id: string;
  fields: {
    Title: string;
    GroupId: string;
    GroupType: string;
    Department?: string;
    ProblemTypeSub?: string;
    IsActive?: boolean;
  };
}

interface SharePointListResponse {
  value: SharePointRBACGroupItem[];
}

// Cache for RBAC config (refreshed periodically)
let cachedConfig: RBACConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch RBAC groups from SharePoint list
 */
export async function fetchRBACConfig(client: Client): Promise<RBACConfig> {
  // Return cached config if still valid
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedConfig;
  }

  // Check if list ID is configured
  if (!RBAC_GROUPS_LIST_ID) {
    console.warn("RBAC Groups list ID not configured, using fallback config");
    return getFallbackConfig();
  }

  try {
    // Don't filter by IsActive on server - SharePoint requires indexed fields for filtering
    // We'll filter client-side instead
    const endpoint = `/sites/${SITE_ID}/lists/${RBAC_GROUPS_LIST_ID}/items?$expand=fields&$top=500`;
    const response: SharePointListResponse = await client.api(endpoint).get();

    const config = parseRBACGroups(response.value);

    // Update cache
    cachedConfig = config;
    cacheTimestamp = now;

    return config;
  } catch (error) {
    console.error("Failed to fetch RBAC config from SharePoint:", error);
    return getFallbackConfig();
  }
}

/**
 * Parse SharePoint list items into RBACConfig
 */
function parseRBACGroups(items: SharePointRBACGroupItem[]): RBACConfig {
  const visibilityGroups: RBACGroup[] = [];
  const departmentGroups: RBACGroup[] = [];
  const adminGroups: RBACGroup[] = [];
  const purchaserGroups: RBACGroup[] = [];
  const inventoryGroups: RBACGroup[] = [];

  const allowedGroupIds = new Set<string>();
  const groupIdToDepartment = new Map<string, string>();
  const groupIdToSubtype = new Map<string, { problemType: string; problemTypeSub: string }>();
  const departmentGroupIds = new Set<string>();
  const adminGroupIds = new Set<string>();
  const purchaserGroupIds = new Set<string>();
  const inventoryGroupIds = new Set<string>();

  for (const item of items) {
    const group: RBACGroup = {
      id: item.id,
      title: item.fields.Title,
      groupId: item.fields.GroupId,
      groupType: item.fields.GroupType as RBACGroup["groupType"],
      department: item.fields.Department,
      problemTypeSub: item.fields.ProblemTypeSub,
      isActive: item.fields.IsActive !== false,
    };

    if (!group.isActive) continue;

    allowedGroupIds.add(group.groupId);

    switch (group.groupType) {
      case "visibility":
        visibilityGroups.push(group);
        break;

      case "department":
        departmentGroups.push(group);
        departmentGroupIds.add(group.groupId);

        if (group.department) {
          groupIdToDepartment.set(group.groupId, group.department);
        }

        if (group.problemTypeSub && group.department) {
          groupIdToSubtype.set(group.groupId, {
            problemType: group.department,
            problemTypeSub: group.problemTypeSub,
          });
        }
        break;

      case "admin":
        adminGroups.push(group);
        adminGroupIds.add(group.groupId);
        break;

      case "purchaser":
        purchaserGroups.push(group);
        purchaserGroupIds.add(group.groupId);
        break;

      case "inventory":
        inventoryGroups.push(group);
        inventoryGroupIds.add(group.groupId);
        break;
    }
  }

  // Elevated = admin + department + purchaser + inventory
  const elevatedGroupIds = new Set<string>();
  adminGroupIds.forEach((id) => elevatedGroupIds.add(id));
  departmentGroupIds.forEach((id) => elevatedGroupIds.add(id));
  purchaserGroupIds.forEach((id) => elevatedGroupIds.add(id));
  inventoryGroupIds.forEach((id) => elevatedGroupIds.add(id));

  return {
    allowedGroupIds,
    visibilityGroups,
    departmentGroups,
    adminGroups,
    purchaserGroups,
    inventoryGroups,
    groupIdToDepartment,
    groupIdToSubtype,
    departmentGroupIds,
    adminGroupIds,
    purchaserGroupIds,
    inventoryGroupIds,
    elevatedGroupIds,
  };
}

/**
 * Fallback configuration when SharePoint list is unavailable
 * Uses hardcoded values from rbacConfig.ts
 */
function getFallbackConfig(): RBACConfig {
  // Import these dynamically to avoid circular dependencies
  const {
    ADMIN_GROUP_ID,
    DEPARTMENT_GROUP_MAP,
    SUBTYPE_GROUP_MAP,
  } = require("./rbacConfig");

  const allowedGroupIds = new Set<string>();
  const visibilityGroups: RBACGroup[] = [];
  const departmentGroups: RBACGroup[] = [];
  const adminGroups: RBACGroup[] = [];
  const purchaserGroups: RBACGroup[] = [];
  const inventoryGroups: RBACGroup[] = [];
  const groupIdToDepartment = new Map<string, string>();
  const groupIdToSubtype = new Map<string, { problemType: string; problemTypeSub: string }>();
  const departmentGroupIds = new Set<string>();
  const adminGroupIds = new Set<string>();
  const purchaserGroupIds = new Set<string>();
  const inventoryGroupIds = new Set<string>();

  // Admin group
  allowedGroupIds.add(ADMIN_GROUP_ID);
  adminGroupIds.add(ADMIN_GROUP_ID);
  adminGroups.push({
    id: "fallback-admin",
    title: "GeneralManagers",
    groupId: ADMIN_GROUP_ID,
    groupType: "admin",
    isActive: true,
  });

  // Department groups
  for (const [dept, groupId] of Object.entries(DEPARTMENT_GROUP_MAP)) {
    allowedGroupIds.add(groupId as string);
    departmentGroupIds.add(groupId as string);
    groupIdToDepartment.set(groupId as string, dept);
    departmentGroups.push({
      id: `fallback-dept-${dept}`,
      title: dept,
      groupId: groupId as string,
      groupType: "department",
      department: dept,
      isActive: true,
    });
  }

  // Subtype groups
  for (const [name, config] of Object.entries(SUBTYPE_GROUP_MAP)) {
    const cfg = config as { problemType: string; problemTypeSub: string; groupId: string };
    allowedGroupIds.add(cfg.groupId);
    departmentGroupIds.add(cfg.groupId);
    groupIdToSubtype.set(cfg.groupId, {
      problemType: cfg.problemType,
      problemTypeSub: cfg.problemTypeSub,
    });
    departmentGroups.push({
      id: `fallback-subtype-${name}`,
      title: name,
      groupId: cfg.groupId,
      groupType: "department",
      department: cfg.problemType,
      problemTypeSub: cfg.problemTypeSub,
      isActive: true,
    });
  }

  const elevatedGroupIds = new Set<string>();
  adminGroupIds.forEach((id) => elevatedGroupIds.add(id));
  departmentGroupIds.forEach((id) => elevatedGroupIds.add(id));
  purchaserGroupIds.forEach((id) => elevatedGroupIds.add(id));
  inventoryGroupIds.forEach((id) => elevatedGroupIds.add(id));

  return {
    allowedGroupIds,
    visibilityGroups,
    departmentGroups,
    adminGroups,
    purchaserGroups,
    inventoryGroups,
    groupIdToDepartment,
    groupIdToSubtype,
    departmentGroupIds,
    adminGroupIds,
    purchaserGroupIds,
    inventoryGroupIds,
    elevatedGroupIds,
  };
}

/**
 * Filter user's group memberships to only include allowed groups
 */
export function filterAllowedGroups(
  userGroupIds: string[],
  config: RBACConfig
): string[] {
  return userGroupIds.filter((id) => config.allowedGroupIds.has(id));
}

/**
 * Get only visibility-type groups from user's memberships
 * (Used for determining ticket visibility for regular users)
 */
export function getVisibilityGroupIds(
  userGroupIds: string[],
  config: RBACConfig
): string[] {
  const visibilityGroupIdSet = new Set(config.visibilityGroups.map((g) => g.groupId));
  return userGroupIds.filter((id) => visibilityGroupIdSet.has(id));
}

/**
 * Check if a user has elevated permissions (admin or support)
 * based on their group memberships
 */
export function hasElevatedPermissions(
  userGroupIds: string[],
  config: RBACConfig
): boolean {
  return userGroupIds.some((id) => config.elevatedGroupIds.has(id));
}

/**
 * Clear the RBAC config cache (useful for testing or forced refresh)
 */
export function clearRBACConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}
