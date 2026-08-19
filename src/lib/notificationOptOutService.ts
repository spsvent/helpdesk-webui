// Notification Opt-Out Service
//
// Manages the NotificationOptOut SharePoint list: email addresses that are
// suppressed from ALL help desk notification email. Opting someone out is
// delivery-only — it does NOT touch their app access or RBAC roles (a GM stays
// a GM, a Purchaser stays a Purchaser); the support desk simply stops emailing
// that address. This is the supported way to silence someone whose notifications
// are otherwise coupled to their role-group membership.
//
// Suppression is ENFORCED SERVER-SIDE in the Azure Functions (graphHelpers.sendMail,
// the SendEmail HTTP function, and checkEscalations). This service is only the
// admin CRUD surface for the list, used by the Settings → Notification Opt-Out tab.
import { Client } from "@microsoft/microsoft-graph-client";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const NOTIFICATION_OPTOUT_LIST_ID = process.env.NEXT_PUBLIC_NOTIFICATION_OPTOUT_LIST_ID || "";

export interface NotificationOptOut {
  id: string;
  email: string;
  displayName: string;
  reason: string;
  isActive: boolean;
}

interface SharePointOptOutItem {
  id: string;
  fields: {
    Title?: string;
    Email?: string;
    Reason?: string;
    IsActive?: boolean;
  };
}

function mapItem(item: SharePointOptOutItem): NotificationOptOut {
  return {
    id: item.id,
    email: item.fields.Email || "",
    displayName: item.fields.Title || "",
    reason: item.fields.Reason || "",
    isActive: item.fields.IsActive !== false,
  };
}

/** Fetch all opt-out entries from SharePoint. */
export async function fetchNotificationOptOuts(client: Client): Promise<NotificationOptOut[]> {
  if (!NOTIFICATION_OPTOUT_LIST_ID) {
    throw new Error("Notification opt-out list not configured");
  }
  const endpoint = `/sites/${SITE_ID}/lists/${NOTIFICATION_OPTOUT_LIST_ID}/items?$expand=fields&$top=500`;
  const response = await client.api(endpoint).get();
  return (response.value || [])
    .map((item: SharePointOptOutItem) => mapItem(item))
    .sort((a: NotificationOptOut, b: NotificationOptOut) =>
      a.displayName.localeCompare(b.displayName)
    );
}

/** Add an email to the opt-out list. */
export async function createNotificationOptOut(
  client: Client,
  entry: { email: string; displayName?: string; reason?: string }
): Promise<NotificationOptOut> {
  if (!NOTIFICATION_OPTOUT_LIST_ID) {
    throw new Error("Notification opt-out list not configured");
  }
  const email = entry.email.trim().toLowerCase();
  const endpoint = `/sites/${SITE_ID}/lists/${NOTIFICATION_OPTOUT_LIST_ID}/items`;
  const response = await client.api(endpoint).post({
    fields: {
      Title: entry.displayName?.trim() || email,
      Email: email,
      Reason: entry.reason?.trim() || "",
      IsActive: true,
    },
  });
  return mapItem(response as SharePointOptOutItem);
}

/** Update an opt-out entry (toggle active, edit fields). */
export async function updateNotificationOptOut(
  client: Client,
  id: string,
  updates: { isActive?: boolean; email?: string; displayName?: string; reason?: string }
): Promise<void> {
  if (!NOTIFICATION_OPTOUT_LIST_ID) {
    throw new Error("Notification opt-out list not configured");
  }
  const endpoint = `/sites/${SITE_ID}/lists/${NOTIFICATION_OPTOUT_LIST_ID}/items/${id}/fields`;
  const fields: Record<string, unknown> = {};
  if (updates.isActive !== undefined) fields.IsActive = updates.isActive;
  if (updates.email !== undefined) fields.Email = updates.email.trim().toLowerCase();
  if (updates.displayName !== undefined) fields.Title = updates.displayName;
  if (updates.reason !== undefined) fields.Reason = updates.reason;
  await client.api(endpoint).patch(fields);
}

/** Remove an email from the opt-out list (restores their notifications). */
export async function deleteNotificationOptOut(client: Client, id: string): Promise<void> {
  if (!NOTIFICATION_OPTOUT_LIST_ID) {
    throw new Error("Notification opt-out list not configured");
  }
  const endpoint = `/sites/${SITE_ID}/lists/${NOTIFICATION_OPTOUT_LIST_ID}/items/${id}`;
  await client.api(endpoint).delete();
}

/**
 * Create the NotificationOptOut SharePoint list (fallback for environments where
 * it doesn't exist yet). Idempotent: reuses the list on a 409 conflict.
 */
export async function createNotificationOptOutList(client: Client): Promise<string> {
  const listData = {
    displayName: "NotificationOptOut",
    description:
      "Emails suppressed from all help desk notifications (app access and RBAC roles are unaffected).",
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
        .filter(`displayName eq 'NotificationOptOut'`)
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

  const columns = [
    { name: "Email", text: {} },
    { name: "Reason", text: { allowMultipleLines: true } },
    { name: "IsActive", boolean: {}, defaultValue: { value: "true" } },
  ];
  for (const col of columns) {
    try {
      await client.api(`/sites/${SITE_ID}/lists/${listId}/columns`).post(col);
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      if (err.statusCode !== 409 && !err.message?.includes("already exists")) {
        throw error;
      }
    }
  }

  return listId;
}
