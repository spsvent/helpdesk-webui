// Visibility Keywords Service
// Manages job title keywords that allow certain users to see pending Request tickets
import { Client } from "@microsoft/microsoft-graph-client";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const VISIBILITY_KEYWORDS_LIST_ID = process.env.NEXT_PUBLIC_VISIBILITY_KEYWORDS_LIST_ID || "";

export interface VisibilityKeyword {
  id: string;
  keyword: string;
  isActive: boolean;
}

interface SharePointKeywordItem {
  id: string;
  fields: {
    Title: string;
    IsActive?: boolean;
  };
}

// Cache for keywords (5-minute TTL)
let keywordsCache: VisibilityKeyword[] | null = null;
let keywordsCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch active visibility keywords from SharePoint
 */
export async function fetchVisibilityKeywords(client: Client): Promise<VisibilityKeyword[]> {
  const now = Date.now();
  if (keywordsCache && now - keywordsCacheTime < CACHE_TTL) {
    return keywordsCache;
  }

  if (!VISIBILITY_KEYWORDS_LIST_ID) {
    return [];
  }

  try {
    const endpoint = `/sites/${SITE_ID}/lists/${VISIBILITY_KEYWORDS_LIST_ID}/items?$expand=fields&$top=500`;
    const response = await client.api(endpoint).get();

    const keywords: VisibilityKeyword[] = (response.value || []).map(
      (item: SharePointKeywordItem) => ({
        id: item.id,
        keyword: item.fields.Title,
        isActive: item.fields.IsActive !== false,
      })
    );

    keywordsCache = keywords;
    keywordsCacheTime = now;

    return keywords;
  } catch (error) {
    console.error("Failed to fetch visibility keywords:", error);
    return [];
  }
}

/**
 * Get only active keywords
 */
export async function getActiveKeywords(client: Client): Promise<string[]> {
  const keywords = await fetchVisibilityKeywords(client);
  return keywords.filter((k) => k.isActive).map((k) => k.keyword.toLowerCase());
}

/**
 * Check if a user's job title matches any active visibility keyword
 * Case-insensitive substring match
 */
export function userMatchesVisibilityKeywords(
  jobTitle: string | undefined | null,
  keywords: string[]
): boolean {
  if (!jobTitle || keywords.length === 0) return false;
  const lowerTitle = jobTitle.toLowerCase();
  return keywords.some((keyword) => lowerTitle.includes(keyword));
}

/**
 * Create a new visibility keyword
 */
export async function createVisibilityKeyword(
  client: Client,
  keyword: string
): Promise<VisibilityKeyword> {
  if (!VISIBILITY_KEYWORDS_LIST_ID) {
    throw new Error("Visibility keywords list not configured");
  }

  const endpoint = `/sites/${SITE_ID}/lists/${VISIBILITY_KEYWORDS_LIST_ID}/items`;
  const response = await client.api(endpoint).post({
    fields: {
      Title: keyword,
      IsActive: true,
    },
  });

  // Invalidate cache
  keywordsCache = null;

  return {
    id: response.id,
    keyword: response.fields.Title,
    isActive: response.fields.IsActive !== false,
  };
}

/**
 * Update a visibility keyword's active status
 */
export async function updateVisibilityKeyword(
  client: Client,
  keywordId: string,
  updates: { isActive?: boolean; keyword?: string }
): Promise<void> {
  if (!VISIBILITY_KEYWORDS_LIST_ID) {
    throw new Error("Visibility keywords list not configured");
  }

  const endpoint = `/sites/${SITE_ID}/lists/${VISIBILITY_KEYWORDS_LIST_ID}/items/${keywordId}/fields`;
  const fields: Record<string, unknown> = {};
  if (updates.isActive !== undefined) fields.IsActive = updates.isActive;
  if (updates.keyword !== undefined) fields.Title = updates.keyword;

  await client.api(endpoint).patch(fields);

  // Invalidate cache
  keywordsCache = null;
}

/**
 * Delete a visibility keyword
 */
export async function deleteVisibilityKeyword(
  client: Client,
  keywordId: string
): Promise<void> {
  if (!VISIBILITY_KEYWORDS_LIST_ID) {
    throw new Error("Visibility keywords list not configured");
  }

  const endpoint = `/sites/${SITE_ID}/lists/${VISIBILITY_KEYWORDS_LIST_ID}/items/${keywordId}`;
  await client.api(endpoint).delete();

  // Invalidate cache
  keywordsCache = null;
}

/**
 * Create the RequestVisibilityKeywords SharePoint list
 */
export async function createVisibilityKeywordsList(client: Client): Promise<string> {
  const listData = {
    displayName: "RequestVisibilityKeywords",
    description: "Job title keywords that grant visibility to pending Request tickets",
    list: { template: "genericList" },
  };

  let listId: string;

  try {
    const list = await client.api(`/sites/${SITE_ID}/lists`).post(listData);
    listId = list.id;
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 409 || err.message?.includes("already exists")) {
      const lists = await client
        .api(`/sites/${SITE_ID}/lists`)
        .filter(`displayName eq 'RequestVisibilityKeywords'`)
        .get();
      if (lists.value && lists.value.length > 0) {
        listId = lists.value[0].id;
      } else {
        throw new Error("List creation conflict but list not found");
      }
    } else {
      throw error;
    }
  }

  // Add IsActive column
  try {
    await client.api(`/sites/${SITE_ID}/lists/${listId}/columns`).post({
      name: "IsActive",
      boolean: {},
      defaultValue: { value: "true" },
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode !== 409 && !err.message?.includes("already exists")) {
      throw error;
    }
  }

  return listId;
}

/**
 * Clear keywords cache (for testing or forced refresh)
 */
export function clearVisibilityKeywordsCache(): void {
  keywordsCache = null;
  keywordsCacheTime = 0;
}
