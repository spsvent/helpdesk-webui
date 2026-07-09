// Order Catalog data model.
//
// The master list of recurring / standard reorder items each area buys week to
// week (janitorial supplies, office supplies, Imperial Dade stock, etc.). One row
// per orderable item. Feeds the recurring order-sheet grid, which turns the rows a
// user sets a quantity on into PurchaseLineItems on a new purchase request.
//
// Self-contained, built on the shared SharePoint envelope (mirrors ./types.ts).

import { SharePointListItem } from "@/shared/spTypes";

// A department key ("Facilities", "Food & Beverage", …) or the literal "Shared"
// for items multiple areas order (office supplies, sanitizer). The order-sheet
// grid defaults its filter to the signed-in user's department + Shared.
export const SHARED_DEPARTMENT = "Shared";

export interface OrderCatalogItem {
  id: string;
  name: string; // item description, e.g. "Black Trash Bags" (Title column)
  category?: string; // section grouping within a sheet, e.g. "Bags", "Cleaners"
  department: string; // owning area, e.g. "Facilities" | "Food & Beverage" | "Shared"
  vendor?: string; // store / distributor, e.g. "Imperial Dade"
  sku?: string; // vendor product code, e.g. "VBPC201PP"
  size?: string; // pack / size label, e.g. "CASE" | "1 GAL" | "43 X 47"
  unitPrice?: number; // estimated $/unit (blank until backfilled by a purchaser/admin)
  url?: string; // optional product link
  sortOrder?: number; // preserves the familiar sheet order within a department
  active: boolean; // deactivate discontinued items without deleting order history
  notes?: string;
  // System
  created: string;
  modified: string;
  createdByEmail: string;
  createdByName: string;
}

// Writable subset used on create/update (maps to SharePoint columns). A value of
// null clears the stored column (same null-to-clear convention as PurchaseWritable);
// an omitted (undefined) key is left untouched.
export type OrderCatalogWritable = {
  [K in
    | "name"
    | "category"
    | "department"
    | "vendor"
    | "sku"
    | "size"
    | "unitPrice"
    | "url"
    | "sortOrder"
    | "active"
    | "notes"]?: OrderCatalogItem[K] | null;
};

export const CATALOG_COLUMN_MAP: Record<keyof OrderCatalogWritable, string> = {
  name: "Title",
  category: "Category",
  department: "Department",
  vendor: "Vendor",
  sku: "Sku",
  size: "Size",
  unitPrice: "UnitPrice",
  url: "Url",
  sortOrder: "SortOrder",
  active: "Active",
  notes: "Notes",
};

export function mapToCatalogItem(item: SharePointListItem): OrderCatalogItem {
  const f = item.fields as Record<string, unknown>;
  const str = (c: string) => (f[c] as string | undefined) || undefined;
  const num = (c: string) => (f[c] as number | undefined);
  return {
    id: item.id,
    name: (f.Title as string) || "",
    category: str("Category"),
    department: (f.Department as string) || SHARED_DEPARTMENT,
    vendor: str("Vendor"),
    sku: str("Sku"),
    size: str("Size"),
    unitPrice: num("UnitPrice"),
    url: str("Url"),
    sortOrder: num("SortOrder"),
    active: f.Active !== false, // treat an unset column as active
    notes: str("Notes"),
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
    createdByEmail: item.createdBy?.user?.email || "",
    createdByName: item.createdBy?.user?.displayName || "",
  };
}
