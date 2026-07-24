// Pure helpers for the recurring order-sheet grid: filtering/grouping catalog
// rows for display, turning entered quantities into purchase line items, and
// computing the org-wide "last ordered" reorder hints from purchase history.
// Kept side-effect free so it's unit-testable (see catalogOrder.test.ts).

import type { OrderCatalogItem } from "./catalogTypes";
import { SHARED_DEPARTMENT } from "./catalogTypes";
import type { PurchaseLineItem, PurchaseRequest } from "./types";

export const ALL_DEPARTMENTS = "All";

export interface ReorderInfo {
  date: string; // ISO datetime the item was last ordered (purchase created date)
  qty: number; // quantity ordered on that most-recent order
}

// Org-wide most-recent order per catalog item, keyed by catalogItemId. "Most
// recent" is by purchase created date (ISO strings sort chronologically). Feeds
// the "last ordered — N" hint shown when a user enters a quantity.
export function buildReorderIndex(purchases: PurchaseRequest[]): Map<string, ReorderInfo> {
  const idx = new Map<string, ReorderInfo>();
  for (const p of purchases) {
    for (const li of p.lineItems) {
      if (!li.catalogItemId) continue;
      const existing = idx.get(li.catalogItemId);
      if (!existing || p.created > existing.date) {
        idx.set(li.catalogItemId, { date: p.created, qty: li.qty });
      }
    }
  }
  return idx;
}

// Which catalog items to show for a chosen department. A specific department also
// includes Shared items (everyone can order those); "All" shows everything.
export function filterByDepartment(items: OrderCatalogItem[], dept: string): OrderCatalogItem[] {
  if (dept === ALL_DEPARTMENTS) return items;
  return items.filter((i) => i.department === dept || i.department === SHARED_DEPARTMENT);
}

// The distinct departments present in the catalog, for the filter dropdown.
// Shared sorts last; the rest alphabetical.
export function availableDepartments(items: OrderCatalogItem[]): string[] {
  const set = new Set(items.map((i) => i.department).filter(Boolean));
  return Array.from(set).sort((a, b) => {
    if (a === SHARED_DEPARTMENT) return 1;
    if (b === SHARED_DEPARTMENT) return -1;
    return a.localeCompare(b);
  });
}

// The department the grid defaults its filter to on load: the signed-in user's
// first editable department that actually has catalog items, else "All".
export function defaultDepartment(editableDepartments: string[], available: string[]): string {
  const match = editableDepartments.find((d) => available.includes(d));
  return match || ALL_DEPARTMENTS;
}

export interface CategoryGroup {
  category: string;
  items: OrderCatalogItem[];
}

// Group items by category (first-appearance order), each group's items sorted by
// sortOrder then name. Uncategorized items collect under "Other".
export function groupByCategory(items: OrderCatalogItem[]): CategoryGroup[] {
  const order: string[] = [];
  const map = new Map<string, OrderCatalogItem[]>();
  for (const it of items) {
    const cat = it.category?.trim() || "Other";
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(it);
  }
  return order.map((cat) => ({
    category: cat,
    items: map
      .get(cat)!
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
  }));
}

// Build purchase line items from the entered quantities (catalogItemId -> qty).
// Only positive quantities become lines; price/label are snapshotted from the
// catalog so historical orders stay accurate, while catalogItemId links back.
export function buildOrderLineItems(
  items: OrderCatalogItem[],
  quantities: Record<string, number>
): PurchaseLineItem[] {
  const lines: PurchaseLineItem[] = [];
  for (const it of items) {
    const qty = quantities[it.id];
    if (!qty || qty <= 0) continue;
    const line: PurchaseLineItem = { name: it.name, qty, cost: it.unitPrice ?? 0, catalogItemId: it.id };
    if (it.sku) line.sku = it.sku;
    if (it.size) line.unit = it.size;
    if (it.vendor) line.vendor = it.vendor;
    if (it.url) line.url = it.url;
    lines.push(line);
  }
  return lines;
}

// The department label to stamp on the created request: the single department the
// ordered items belong to, or "Multiple" when the order spans more than one.
export function orderDepartmentLabel(orderedItems: OrderCatalogItem[]): string {
  const depts = Array.from(new Set(orderedItems.map((i) => i.department).filter(Boolean)));
  if (depts.length === 1) return depts[0];
  return depts.length === 0 ? "" : "Multiple";
}

// Estimated total for the current quantities (0 for items whose price isn't set yet).
export function estimatedTotal(items: OrderCatalogItem[], quantities: Record<string, number>): number {
  return items.reduce((sum, it) => {
    const qty = quantities[it.id];
    return qty && qty > 0 ? sum + qty * (it.unitPrice ?? 0) : sum;
  }, 0);
}
