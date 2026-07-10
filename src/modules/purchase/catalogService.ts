// Order Catalog data service — talks to the OrderCatalog SharePoint list.
// Mirrors purchaseService.ts. This is master/reference data (the reorder items),
// distinct from the transactional PurchaseRequests list.

import { Client } from "@microsoft/microsoft-graph-client";
import { ensureList, type SharePointColumnDef } from "@/shared/ensureList";
import { fetchAllListItems } from "@/shared/listItems";
import {
  OrderCatalogItem,
  OrderCatalogWritable,
  CATALOG_COLUMN_MAP,
  mapToCatalogItem,
} from "./catalogTypes";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const CATALOG_LIST_ID = process.env.NEXT_PUBLIC_ORDER_CATALOG_LIST_ID || "";

export const CATALOG_LIST_NAME = "OrderCatalog";

export function isCatalogConfigured(): boolean {
  return !!CATALOG_LIST_ID;
}

function toFields(w: OrderCatalogWritable): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  (Object.keys(w) as (keyof OrderCatalogWritable)[]).forEach((k) => {
    const value = w[k];
    if (value === undefined) return;
    fields[CATALOG_COLUMN_MAP[k]] = value;
  });
  return fields;
}

// --- read -------------------------------------------------------------------

// The full catalog (paged — fetchAllListItems follows @odata.nextLink so a large
// catalog isn't silently truncated). Inactive items are dropped unless asked for
// (the admin editor wants them).
export async function listCatalogItems(
  client: Client,
  opts?: { includeInactive?: boolean }
): Promise<OrderCatalogItem[]> {
  if (!CATALOG_LIST_ID) return [];
  const endpoint = `/sites/${SITE_ID}/lists/${CATALOG_LIST_ID}/items?$expand=fields&$top=1000`;
  const items = await fetchAllListItems(client, endpoint);
  const mapped = items.map(mapToCatalogItem);
  return opts?.includeInactive ? mapped : mapped.filter((i) => i.active);
}

export async function getCatalogItem(client: Client, id: string): Promise<OrderCatalogItem> {
  const item = await client
    .api(`/sites/${SITE_ID}/lists/${CATALOG_LIST_ID}/items/${id}?$expand=fields`)
    .get();
  return mapToCatalogItem(item);
}

// --- write ------------------------------------------------------------------

export async function createCatalogItem(
  client: Client,
  input: OrderCatalogWritable
): Promise<OrderCatalogItem> {
  if (!CATALOG_LIST_ID)
    throw new Error("Order catalog list is not configured (NEXT_PUBLIC_ORDER_CATALOG_LIST_ID)");
  const created = await client
    .api(`/sites/${SITE_ID}/lists/${CATALOG_LIST_ID}/items`)
    .post({ fields: toFields(input) });
  return getCatalogItem(client, created.id);
}

export async function updateCatalogItem(
  client: Client,
  id: string,
  patch: OrderCatalogWritable
): Promise<OrderCatalogItem> {
  if (!CATALOG_LIST_ID) throw new Error("Order catalog list is not configured");
  await client
    .api(`/sites/${SITE_ID}/lists/${CATALOG_LIST_ID}/items/${id}`)
    .patch({ fields: toFields(patch) });
  return getCatalogItem(client, id);
}

// Soft-delete: deactivate so it drops off order sheets but keeps history readable.
export async function deactivateCatalogItem(client: Client, id: string): Promise<OrderCatalogItem> {
  return updateCatalogItem(client, id, { active: false });
}

// Hard delete — for cleaning up mistakes; prefer deactivate for real retirements.
export async function deleteCatalogItem(client: Client, id: string): Promise<void> {
  if (!CATALOG_LIST_ID) throw new Error("Order catalog list is not configured");
  await client.api(`/sites/${SITE_ID}/lists/${CATALOG_LIST_ID}/items/${id}`).delete();
}

// Distinct vendor names currently in the catalog — feeds the admin editor's
// vendor autocomplete so "group by vendor" stays consistent without a rigid list.
export function distinctVendors(items: OrderCatalogItem[]): string[] {
  return Array.from(
    new Set(items.map((i) => i.vendor?.trim()).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b));
}

// --- list bootstrap (admin one-time setup) ----------------------------------

const TEXT = (name: string): SharePointColumnDef => ({
  name,
  text: { allowMultipleLines: false, maxLength: 255 },
});
const MEMO = (name: string): SharePointColumnDef => ({ name, text: { allowMultipleLines: true } });
const NUM = (name: string): SharePointColumnDef => ({ name, number: {} });
const BOOL = (name: string): SharePointColumnDef => ({ name, boolean: {} });

const CATALOG_COLUMNS: SharePointColumnDef[] = [
  TEXT("Category"),
  TEXT("Department"),
  TEXT("Vendor"),
  TEXT("Sku"),
  TEXT("Size"),
  NUM("UnitPrice"),
  TEXT("Url"),
  NUM("SortOrder"),
  BOOL("Active"),
  MEMO("Notes"),
];

export async function ensureOrderCatalogList(client: Client): Promise<string> {
  return ensureList(
    client,
    CATALOG_LIST_NAME,
    "Recurring order catalog — master list of standard reorder items",
    CATALOG_COLUMNS
  );
}
