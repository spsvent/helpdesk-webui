// List-agnostic SharePoint Graph helpers shared across form modules.
//
// These were originally defined in src/types/ticket.ts. They are not specific to
// tickets — any module backed by a SharePoint list (e.g. the CDW form module)
// reuses the same response envelope and Person/Lookup field parsing. ticket.ts
// re-exports them so existing imports keep working unchanged.

// SharePoint Graph API response types
export interface SharePointListItem {
  id: string;
  fields: Record<string, unknown>;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy: {
    user: {
      id: string;
      displayName: string;
      email?: string;
    };
  };
}

export interface SharePointListResponse {
  value: SharePointListItem[];
  "@odata.nextLink"?: string;
}

// Extract display name from a SharePoint Person/Lookup field.
// Graph API may return these as an object with LookupValue, or as a plain string.
export function getPersonDisplayName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const obj = field as Record<string, unknown>;
    return (obj.LookupValue as string) || (obj.Title as string) || (obj.Email as string) || "";
  }
  return "";
}

export function getPersonEmail(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const obj = field as Record<string, unknown>;
  return (obj.Email as string) || "";
}
