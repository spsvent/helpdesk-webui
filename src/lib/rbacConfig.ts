// RBAC Configuration - Role-Based Access Control settings - FALLBACK ONLY
// This file contains fallback configuration used when SharePoint RBACGroups list is unavailable.
// For production, configure the RBACGroups SharePoint list to avoid exposing emails in code.
// See rbacConfigService.ts for the SharePoint-based configuration.

// Admin emails from environment variable (comma-separated)
// Fallback to empty array if not configured - rely on group membership instead
const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
export const ADMIN_EMAILS = adminEmailsEnv
  .split(",")
  .map((email) => email.trim())
  .filter((email) => email.length > 0);

// Admin group - members have full access
export const ADMIN_GROUP_ID = "db86fdc8-dbf7-4ec9-af9f-461bb63735ed"; // GeneralManagers

// Department to Entra Group mapping
// Support staff in these groups can edit tickets with matching ProblemType
export const DEPARTMENT_GROUP_MAP: Record<string, string> = {
  Tech: "7e1b9f86-5fc0-4f83-a6d2-e52167d0e4cf", // IT/AV
  Operations: "12c1b657-305b-4fb3-8534-bcf1fe5cd326",
  Marketing: "7114b9f5-734e-4c0d-a46d-0c96679d51c0",
  "Grounds Keeping": "b9dbaa5a-5bda-4ca0-bcb6-bd2f3783739f", // Grounds
  Janitorial: "0334654b-6c6a-4a29-9f00-7dcd09c34b3d",
  HR: "bcd1cb4f-d182-4f0e-8ace-fdee41e005f8", // HR Manager
  "Customer Service": "aa6020eb-e4b4-46ce-a720-945cf2bf5d8d", // Admissions
  // "Other" - handled specially: any support staff can edit
};

// Reverse lookup: Group ID to ProblemType
export const GROUP_TO_DEPARTMENT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(DEPARTMENT_GROUP_MAP).map(([dept, groupId]) => [groupId, dept])
);

// Sub-type restricted groups (more granular permissions)
// These groups can only edit tickets matching both problemType AND problemTypeSub
export interface SubtypeGroupConfig {
  problemType: string;
  problemTypeSub: string;
  groupId: string;
}

export const SUBTYPE_GROUP_MAP: Record<string, SubtypeGroupConfig> = {
  POSadmins: {
    problemType: "Tech",
    problemTypeSub: "POS",
    groupId: "b581fbb5-5a56-459e-8342-4386d43b048d",
  },
};

// Get all support group IDs (for "Other" ProblemType editing check)
export const ALL_SUPPORT_GROUP_IDS: string[] = [
  ...Object.values(DEPARTMENT_GROUP_MAP),
  ...Object.values(SUBTYPE_GROUP_MAP).map((s) => s.groupId),
];

// Get all group IDs that grant elevated permissions (admin + support)
export const ALL_ELEVATED_GROUP_IDS: string[] = [
  ADMIN_GROUP_ID,
  ...ALL_SUPPORT_GROUP_IDS,
];

// Check if an email is a hardcoded admin
export function isHardcodedAdmin(email: string): boolean {
  return ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === email.toLowerCase()
  );
}

// Get the department(s) a user can edit based on their group memberships
export function getDepartmentsForGroups(groupIds: string[]): string[] {
  const departments: string[] = [];

  for (const groupId of groupIds) {
    const dept = GROUP_TO_DEPARTMENT_MAP[groupId];
    if (dept && !departments.includes(dept)) {
      departments.push(dept);
    }
  }

  return departments;
}

// Get subtype restrictions for a user based on their group memberships
export function getSubtypeRestrictionsForGroups(
  groupIds: string[]
): SubtypeGroupConfig[] {
  const restrictions: SubtypeGroupConfig[] = [];

  for (const config of Object.values(SUBTYPE_GROUP_MAP)) {
    if (groupIds.includes(config.groupId)) {
      restrictions.push(config);
    }
  }

  return restrictions;
}

// Check if user has any support group membership
export function isInAnySupportGroup(groupIds: string[]): boolean {
  return groupIds.some((id) => ALL_SUPPORT_GROUP_IDS.includes(id));
}

// Check if user is in admin group
export function isInAdminGroup(groupIds: string[]): boolean {
  return groupIds.includes(ADMIN_GROUP_ID);
}
