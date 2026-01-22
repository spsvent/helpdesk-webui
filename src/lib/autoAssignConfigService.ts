// Auto-Assignment Configuration Service - Fetches assignment rules from SharePoint
import { Client } from "@microsoft/microsoft-graph-client";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const AUTO_ASSIGN_LIST_ID = process.env.NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID || "";

// Types for auto-assignment rules from SharePoint
export interface AutoAssignRule {
  id: string;
  department?: string;          // ProblemType to match
  subCategory?: string;         // ProblemTypeSub to match
  specificType?: string;        // ProblemTypeSub2 to match
  category?: "Request" | "Problem";
  priority?: "Low" | "Normal" | "High" | "Urgent";
  assignToEmail: string;        // Email of the assignee
  sortOrder: number;            // Lower numbers = higher priority
  isActive: boolean;
}

export interface AutoAssignConfig {
  rules: AutoAssignRule[];
}

interface SharePointAutoAssignItem {
  id: string;
  fields: {
    Title: string;              // Friendly name for the rule
    Department?: string;
    SubCategory?: string;
    SpecificType?: string;
    Category?: string;
    Priority?: string;
    AssignToEmail: string;
    SortOrder?: number;
    IsActive?: boolean;
  };
}

interface SharePointListResponse {
  value: SharePointAutoAssignItem[];
}

// Cache for auto-assign config (refreshed periodically)
let cachedConfig: AutoAssignConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch auto-assignment rules from SharePoint list
 */
export async function fetchAutoAssignConfig(client: Client): Promise<AutoAssignConfig> {
  // Return cached config if still valid
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedConfig;
  }

  // Check if list ID is configured
  if (!AUTO_ASSIGN_LIST_ID) {
    console.warn("Auto-Assign list ID not configured, using fallback config");
    return getFallbackConfig();
  }

  try {
    const endpoint = `/sites/${SITE_ID}/lists/${AUTO_ASSIGN_LIST_ID}/items?$expand=fields&$top=500`;
    const response: SharePointListResponse = await client.api(endpoint).get();

    const config = parseAutoAssignRules(response.value);

    // Update cache
    cachedConfig = config;
    cacheTimestamp = now;

    return config;
  } catch (error) {
    console.error("Failed to fetch auto-assign config from SharePoint:", error);
    return getFallbackConfig();
  }
}

/**
 * Parse SharePoint list items into AutoAssignConfig
 */
function parseAutoAssignRules(items: SharePointAutoAssignItem[]): AutoAssignConfig {
  const rules: AutoAssignRule[] = [];

  for (const item of items) {
    const rule: AutoAssignRule = {
      id: item.id,
      department: item.fields.Department,
      subCategory: item.fields.SubCategory,
      specificType: item.fields.SpecificType,
      category: item.fields.Category as AutoAssignRule["category"],
      priority: item.fields.Priority as AutoAssignRule["priority"],
      assignToEmail: item.fields.AssignToEmail,
      sortOrder: item.fields.SortOrder ?? 100,
      isActive: item.fields.IsActive !== false,
    };

    if (!rule.isActive || !rule.assignToEmail) continue;

    rules.push(rule);
  }

  // Sort by sortOrder (lower = higher priority)
  rules.sort((a, b) => a.sortOrder - b.sortOrder);

  return { rules };
}

/**
 * Fallback configuration when SharePoint list is unavailable
 * Uses minimal defaults - no email exposure
 */
function getFallbackConfig(): AutoAssignConfig {
  // Return empty rules - no fallback emails exposed in code
  // The hardcoded config in autoAssignConfig.ts will be used as last resort
  console.warn("Using hardcoded auto-assign fallback - configure SharePoint list for production");
  return { rules: [] };
}

/**
 * Find matching auto-assignment rule
 * Rules are checked in order of sortOrder (lowest first)
 */
export function findMatchingRule(
  config: AutoAssignConfig,
  department: string,
  subCategory?: string,
  specificType?: string,
  category?: "Request" | "Problem",
  priority?: "Low" | "Normal" | "High" | "Urgent"
): AutoAssignRule | null {
  for (const rule of config.rules) {
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
 * Get suggested assignee email for a ticket
 */
export function getSuggestedAssigneeFromConfig(
  config: AutoAssignConfig,
  department: string,
  subCategory?: string,
  specificType?: string,
  category?: "Request" | "Problem",
  priority?: "Low" | "Normal" | "High" | "Urgent"
): string | null {
  const rule = findMatchingRule(config, department, subCategory, specificType, category, priority);
  return rule?.assignToEmail || null;
}

/**
 * Clear the auto-assign config cache (useful for testing or forced refresh)
 */
export function clearAutoAssignConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}
