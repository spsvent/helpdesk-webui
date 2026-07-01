// Line-item helpers for the purchase module (module copy of src/lib/lineItemHelpers.ts,
// retyped to the module's own PurchaseLineItem). The shared lib copy is removed in
// Part F once the ticket flow no longer uses it.

import type { PurchaseLineItem } from "./types";

export function computeEstimatedTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.cost, 0);
}

export function computeActualTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * (item.actualCost ?? item.cost), 0);
}

export function allItemsOrdered(items: PurchaseLineItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => Boolean(item.vendor && item.orderNum));
}

export function allItemsReceived(items: PurchaseLineItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => Boolean(item.receivedDate) && (item.receivedQty ?? 0) >= item.qty);
}

export function distinctVendorCount(items: PurchaseLineItem[]): number {
  return new Set(items.map((i) => i.vendor).filter(Boolean)).size;
}

export function validateLineItem(item: Partial<PurchaseLineItem>): string | null {
  if (!item.name?.trim() && !item.url?.trim()) return "Either a name or URL is required.";
  if (item.qty == null || item.qty < 1) return "Quantity must be at least 1.";
  if (item.cost == null || item.cost < 0) return "Cost must be 0 or greater.";
  return null;
}
