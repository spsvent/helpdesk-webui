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

// An item counts as "ordered" once it has a vendor. Order # is optional (some
// vendors/flows don't produce one), so it is NOT part of this check — otherwise an
// ordered item with no order # would never leave the awaiting-order queue.
export function allItemsOrdered(items: PurchaseLineItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => Boolean(item.vendor?.trim()));
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

export function validateLineItem(item: Partial<PurchaseLineItem>): string | null {
  // A product link is required on every item in the initial request — purchasers
  // need to see exactly what to buy.
  if (!item.url?.trim()) return "A product link (URL) is required for each item.";
  if (!isSafeItemUrl(item.url.trim())) return "The URL must be a valid http(s) link.";
  if (item.qty == null || item.qty < 1) return "Quantity must be at least 1.";
  if (item.cost == null || item.cost < 0) return "Cost must be 0 or greater.";
  return null;
}
