// Location Service
//
// Admin-added ticket locations live in a "TicketLocations" SharePoint list. The
// built-in list in locationConfig.ts is always included, so the form keeps
// working if the list doesn't exist yet or can't be read. The list is looked up
// by display name (no build-time list-id env var needed) and created on first add.
import { Client } from "@microsoft/microsoft-graph-client";
import { mergeLocations } from "./locationConfig";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const LIST_NAME = "TicketLocations";

export interface CustomLocation {
  id: string;
  name: string;
}

let cachedListId: string | null = null;

async function findListId(client: Client): Promise<string | null> {
  if (cachedListId) return cachedListId;
  const lists = await client
    .api(`/sites/${SITE_ID}/lists`)
    .filter(`displayName eq '${LIST_NAME}'`)
    .get();
  cachedListId = lists.value?.[0]?.id ?? null;
  return cachedListId;
}

async function createList(client: Client): Promise<string> {
  const list = await client.api(`/sites/${SITE_ID}/lists`).post({
    displayName: LIST_NAME,
    description: "Extra ticket locations added by admins (merged with the built-in list).",
    list: { template: "genericList" },
  });
  cachedListId = list.id;
  return list.id;
}

/** Admin-added locations only (empty if the list doesn't exist yet). */
export async function fetchCustomLocations(client: Client): Promise<CustomLocation[]> {
  const listId = await findListId(client);
  if (!listId) return [];
  const res = await client
    .api(`/sites/${SITE_ID}/lists/${listId}/items?$expand=fields&$top=500`)
    .get();
  return (res.value || [])
    .map((i: { id: string; fields: { Title?: string } }) => ({ id: i.id, name: i.fields.Title || "" }))
    .filter((l: CustomLocation) => l.name)
    .sort((a: CustomLocation, b: CustomLocation) => a.name.localeCompare(b.name));
}

/** Full dropdown list (built-in + custom). Never throws — falls back to built-ins. */
export async function fetchAllLocations(client: Client): Promise<string[]> {
  try {
    const custom = await fetchCustomLocations(client);
    return mergeLocations(custom.map((c) => c.name));
  } catch (err) {
    console.warn("Failed to load custom locations, using built-in list:", err);
    return mergeLocations([]);
  }
}

export async function addCustomLocation(client: Client, name: string): Promise<CustomLocation> {
  const listId = (await findListId(client)) ?? (await createList(client));
  const res = await client
    .api(`/sites/${SITE_ID}/lists/${listId}/items`)
    .post({ fields: { Title: name.trim() } });
  return { id: res.id, name: name.trim() };
}

export async function deleteCustomLocation(client: Client, id: string): Promise<void> {
  const listId = await findListId(client);
  if (!listId) return;
  await client.api(`/sites/${SITE_ID}/lists/${listId}/items/${id}`).delete();
}
