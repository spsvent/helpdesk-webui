// src/lib/lineItemHelpers.ts
import type { PurchaseLineItem } from "@/types/ticket";

export function serializeLineItems(items: PurchaseLineItem[]): string {
  return JSON.stringify(items);
}

export function parseLineItems(json: string | undefined | null): PurchaseLineItem[] {
  if (!json || !json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PurchaseLineItem[]) : [];
  } catch {
    return [];
  }
}

export function computeEstimatedTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.cost, 0);
}

export function computeActualTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => {
    const perItem = item.actualCost ?? item.cost;
    return sum + item.qty * perItem;
  }, 0);
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

// True when a line item's URL is a parseable http(s) URL. The URL is rendered as
// a raw <a href> (LineItemsTable), so anything else — including javascript: —
// must be rejected at entry.
export function isSafeItemUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Validate a row is fillable. Returns null if valid, otherwise an error string.
export function validateLineItem(item: Partial<PurchaseLineItem>): string | null {
  if (!item.name?.trim() && !item.url?.trim()) {
    return "Either a name or URL is required.";
  }
  if (item.url?.trim() && !isSafeItemUrl(item.url.trim())) return "The URL must be a valid http(s) link.";
  if (item.qty == null || item.qty < 1) return "Quantity must be at least 1.";
  if (item.cost == null || item.cost < 0) return "Cost must be 0 or greater.";
  return null;
}
