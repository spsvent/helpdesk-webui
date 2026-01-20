// RBAC Type Definitions

export type UserRole = "admin" | "support" | "user";

export interface SubtypeRestriction {
  problemType: string;
  problemTypeSub: string;
}

export interface UserPermissions {
  role: UserRole;
  email: string;
  displayName: string;

  // Group memberships from Entra ID
  groupMemberships: string[];

  // Departments the user can edit (based on group memberships)
  // Empty for admins (can edit all) and users (can only edit own)
  editableDepartments: string[];

  // Sub-type restrictions (for POSadmins, etc.)
  // If set, user can only edit tickets matching these specific sub-types
  subtypeRestrictions: SubtypeRestriction[];

  // Computed permission flags
  canDelete: boolean;
  canEditAllFields: boolean;
  canSeeAllTickets: boolean;
  canEditOtherDepartment: boolean; // Can edit tickets with ProblemType = "Other"
}

// Context value for the RBAC provider
export interface RBACContextValue {
  permissions: UserPermissions | null;
  loading: boolean;
  error: string | null;
}

// Default permissions for unauthenticated users
export const DEFAULT_PERMISSIONS: UserPermissions = {
  role: "user",
  email: "",
  displayName: "",
  groupMemberships: [],
  editableDepartments: [],
  subtypeRestrictions: [],
  canDelete: false,
  canEditAllFields: false,
  canSeeAllTickets: false,
  canEditOtherDepartment: false,
};

// Helper to create admin permissions
export function createAdminPermissions(
  email: string,
  displayName: string,
  groupMemberships: string[]
): UserPermissions {
  return {
    role: "admin",
    email,
    displayName,
    groupMemberships,
    editableDepartments: [], // Admins can edit all, so this is empty
    subtypeRestrictions: [],
    canDelete: true,
    canEditAllFields: true,
    canSeeAllTickets: true,
    canEditOtherDepartment: true,
  };
}

// Helper to create support staff permissions
export function createSupportPermissions(
  email: string,
  displayName: string,
  groupMemberships: string[],
  editableDepartments: string[],
  subtypeRestrictions: SubtypeRestriction[]
): UserPermissions {
  return {
    role: "support",
    email,
    displayName,
    groupMemberships,
    editableDepartments,
    subtypeRestrictions,
    canDelete: false, // Only admins can delete
    canEditAllFields: false, // Support can edit assigned tickets but not all fields
    canSeeAllTickets: true, // Support can see all tickets
    canEditOtherDepartment: editableDepartments.length > 0, // If they have any department, they can edit "Other"
  };
}

// Helper to create regular user permissions
export function createUserPermissions(
  email: string,
  displayName: string,
  groupMemberships: string[]
): UserPermissions {
  return {
    role: "user",
    email,
    displayName,
    groupMemberships,
    editableDepartments: [],
    subtypeRestrictions: [],
    canDelete: false,
    canEditAllFields: false,
    canSeeAllTickets: false, // Users can only see own + group members' tickets
    canEditOtherDepartment: false,
  };
}
