// Auto-assignment configuration - FALLBACK ONLY
// This file contains fallback rules used when SharePoint AutoAssign list is unavailable.
// For production, configure the AutoAssign SharePoint list to avoid exposing emails in code.
// See autoAssignConfigService.ts for the SharePoint-based configuration.

export interface AssignmentRule {
  // Match conditions (all must match if specified)
  department?: string;          // ProblemType
  subCategory?: string;         // ProblemTypeSub
  specificType?: string;        // ProblemTypeSub2
  category?: "Request" | "Problem";
  priority?: "Low" | "Normal" | "High" | "Urgent";

  // Assignment target (user email or group display name)
  assignTo: string;
  // Optional: SharePoint lookup ID (faster if known)
  assignToLookupId?: number;
  // Optional: Entra ID group ID for assignee preview (when email doesn't resolve to group)
  groupId?: string;
}

// Auto-assignment rules - first matching rule wins
// More specific rules should come before general ones
export const AUTO_ASSIGNMENT_RULES: AssignmentRule[] = [
  // Tech department assignments
  {
    department: "Tech",
    subCategory: "IT",
    assignTo: "itav@skyparksantasvillage.com",
  },
  {
    department: "Tech",
    subCategory: "POS",
    specificType: "Software - POS",
    assignTo: "posadmins@skyparksantasvillage.com",
  },
  {
    department: "Tech",
    subCategory: "POS",
    assignTo: "itav@skyparksantasvillage.com",
  },
  {
    department: "Tech",
    subCategory: "User Access",
    assignTo: "itav@skyparksantasvillage.com",
  },
  {
    department: "Tech",
    assignTo: "itav@skyparksantasvillage.com",
  },

  // Operations assignments
  {
    department: "Operations",
    subCategory: "Dangerous Condition",
    priority: "Urgent",
    assignTo: "operations@skyparksantasvillage.com",
    groupId: "12c1b657-305b-4fb3-8534-bcf1fe5cd326",
  },
  {
    department: "Operations",
    assignTo: "operations@skyparksantasvillage.com",
    groupId: "12c1b657-305b-4fb3-8534-bcf1fe5cd326",
  },

  // Grounds Keeping assignments
  {
    department: "Grounds Keeping",
    assignTo: "grounds@skyparksantasvillage.com",
  },

  // Janitorial assignments
  {
    department: "Janitorial",
    assignTo: "janitorial@skyparksantasvillage.com",
  },

  // Marketing assignments
  {
    department: "Marketing",
    assignTo: "marketing@skyparksantasvillage.com",
  },

  // HR assignments
  {
    department: "HR",
    assignTo: "hr@skyparksantasvillage.com",
    groupId: "bcd1cb4f-d182-4f0e-8ace-fdee41e005f8",
  },

  // Customer Service assignments
  {
    department: "Customer Service",
    assignTo: "guestservices@skyparksantasvillage.com",
  },

  // Inventory assignments
  {
    department: "Inventory",
    assignTo: "inventory@skyparksantasvillage.com",
    groupId: "3c9e89ce-83dd-4c31-a884-01404b81898e",
  },
];

/**
 * Find the first matching assignment rule for a ticket
 */
export function findAssignmentRule(
  department: string,
  subCategory?: string,
  specificType?: string,
  category?: "Request" | "Problem",
  priority?: "Low" | "Normal" | "High" | "Urgent"
): AssignmentRule | null {
  for (const rule of AUTO_ASSIGNMENT_RULES) {
    // Check each condition if specified in the rule
    if (rule.department && rule.department !== department) continue;
    if (rule.subCategory && rule.subCategory !== subCategory) continue;
    if (rule.specificType && rule.specificType !== specificType) continue;
    if (rule.category && rule.category !== category) continue;
    if (rule.priority && rule.priority !== priority) continue;

    // All specified conditions match
    return rule;
  }

  return null;
}

/**
 * Get the suggested assignee for a ticket based on its properties
 * Returns the email of the suggested assignee, or null if no rule matches
 */
export function getSuggestedAssignee(
  department: string,
  subCategory?: string,
  specificType?: string,
  category?: "Request" | "Problem",
  priority?: "Low" | "Normal" | "High" | "Urgent"
): string | null {
  const rule = findAssignmentRule(department, subCategory, specificType, category, priority);
  return rule?.assignTo || null;
}

/**
 * Get the suggested assignee with group ID for preview lookups
 * Returns both email and optional groupId for Entra lookups
 */
export function getSuggestedAssigneeWithGroup(
  department: string,
  subCategory?: string,
  specificType?: string,
  category?: "Request" | "Problem",
  priority?: "Low" | "Normal" | "High" | "Urgent"
): { email: string; groupId?: string } | null {
  const rule = findAssignmentRule(department, subCategory, specificType, category, priority);
  if (!rule) return null;
  return { email: rule.assignTo, groupId: rule.groupId };
}
