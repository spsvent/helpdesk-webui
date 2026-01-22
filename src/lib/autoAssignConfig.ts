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

  // Operations assignments (placeholder - update with actual users)
  {
    department: "Operations",
    subCategory: "Dangerous Condition",
    priority: "Urgent",
    assignTo: "operations@skyparksantasvillage.com",
  },
  {
    department: "Operations",
    assignTo: "operations@skyparksantasvillage.com",
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
  },

  // Customer Service assignments
  {
    department: "Customer Service",
    assignTo: "guestservices@skyparksantasvillage.com",
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
