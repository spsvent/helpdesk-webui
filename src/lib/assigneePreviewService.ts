// Assignee Preview Service - Resolves assignee information from Entra ID
import { Client } from "@microsoft/microsoft-graph-client";

export interface AssigneeInfo {
  email: string;
  displayName: string;
  jobTitle?: string;
  isGroup: boolean;
}

export interface AssigneePreviewData {
  assignees: AssigneeInfo[];
  loading: boolean;
  error?: string;
}

// Cache for assignee lookups (5 minute TTL)
const assigneeCache = new Map<string, { data: AssigneeInfo[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if an email belongs to a group or a user
 * Returns the type and ID for further lookups
 */
async function resolveEmailType(
  client: Client,
  email: string
): Promise<{ type: "user" | "group" | "unknown"; id?: string }> {
  // Try to find as a user first
  try {
    const user = await client
      .api(`/users/${encodeURIComponent(email)}`)
      .select("id,mail,userPrincipalName")
      .get();
    return { type: "user", id: user.id };
  } catch {
    // Not a user, try as a group
  }

  // Try to find as a group by mail
  try {
    const response = await client
      .api("/groups")
      .filter(`mail eq '${email}'`)
      .select("id,displayName,mail")
      .get();

    if (response.value && response.value.length > 0) {
      return { type: "group", id: response.value[0].id };
    }
  } catch {
    // Not found as a group either
  }

  // Try mail-enabled group search
  try {
    const response = await client
      .api("/groups")
      .filter(`proxyAddresses/any(p:p eq 'smtp:${email}')`)
      .select("id,displayName,mail")
      .get();

    if (response.value && response.value.length > 0) {
      return { type: "group", id: response.value[0].id };
    }
  } catch {
    // Final fallback
  }

  return { type: "unknown" };
}

/**
 * Get user info including job title
 */
async function getUserInfo(client: Client, email: string): Promise<AssigneeInfo | null> {
  try {
    const user = await client
      .api(`/users/${encodeURIComponent(email)}`)
      .select("id,displayName,mail,jobTitle,userPrincipalName")
      .get();

    return {
      email: user.mail || user.userPrincipalName || email,
      displayName: user.displayName || email,
      jobTitle: user.jobTitle,
      isGroup: false,
    };
  } catch (error) {
    console.error(`Failed to get user info for ${email}:`, error);
    return null;
  }
}

/**
 * Get all members of a group with their job titles
 */
async function getGroupMembers(client: Client, groupId: string): Promise<AssigneeInfo[]> {
  const members: AssigneeInfo[] = [];

  try {
    const response = await client
      .api(`/groups/${groupId}/members`)
      .select("id,displayName,mail,jobTitle,userPrincipalName")
      .get();

    for (const member of response.value || []) {
      // Only include users (not nested groups)
      if (member["@odata.type"] === "#microsoft.graph.user") {
        members.push({
          email: member.mail || member.userPrincipalName || "",
          displayName: member.displayName || "Unknown",
          jobTitle: member.jobTitle,
          isGroup: false,
        });
      }
    }
  } catch (error) {
    console.error(`Failed to get group members for ${groupId}:`, error);
  }

  // Sort by job title (or display name if no title)
  members.sort((a, b) => {
    const titleA = a.jobTitle || a.displayName;
    const titleB = b.jobTitle || b.displayName;
    return titleA.localeCompare(titleB);
  });

  return members;
}

/**
 * Resolve assignee email to full info (user or group members)
 * Returns array of AssigneeInfo (single user or multiple group members)
 * @param groupId - Optional Entra group ID for direct lookup (bypasses email resolution)
 */
export async function resolveAssigneeInfo(
  client: Client,
  email: string,
  groupId?: string
): Promise<AssigneeInfo[]> {
  if (!email) {
    return [];
  }

  // Cache key includes groupId if provided
  const cacheKey = groupId ? `${email.toLowerCase()}:${groupId}` : email.toLowerCase();

  // Check cache first
  const cached = assigneeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let result: AssigneeInfo[] = [];

  // If groupId is provided, use it directly
  if (groupId) {
    result = await getGroupMembers(client, groupId);
  } else {
    // Resolve the email type
    const { type, id } = await resolveEmailType(client, email);

    if (type === "user" && id) {
      // It's a user - get their info
      const userInfo = await getUserInfo(client, email);
      if (userInfo) {
        result = [userInfo];
      }
    } else if (type === "group" && id) {
      // It's a group - get all members
      result = await getGroupMembers(client, id);
    } else {
      // Unknown type - return basic info
      result = [{
        email,
        displayName: email.split("@")[0],
        isGroup: false,
      }];
    }
  }

  // Cache the result
  assigneeCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Clear the assignee cache (useful for testing)
 */
export function clearAssigneeCache(): void {
  assigneeCache.clear();
}
