// Shared row shape + helpers for the Awaiting Order / Awaiting Receipt queues.
//
// Purchase requests were extracted into their own module; the queue pages now read
// exclusively from the PurchaseRequests list (src/modules/purchase/queueRows.ts),
// which builds these QueueRow objects. This file keeps only the cross-cutting bits
// that aren't purchase-module-specific: the row shape, vendor inference, and the
// vendor grouping used by the table render.

import type { PurchaseLineItem } from "@/types/ticket";

// One row of the flat queue. Carries the parent record context plus the item itself
// (and its index within the parent's lineItems array, so a bulk write can target the
// correct slot).
export interface QueueRow {
  // Row provenance. Today every row is source:"purchase" (the PurchaseRequests
  // list); the field is retained so the queue can carry future producers without a
  // shape change, and because item ids are not unique across lists.
  source: "ticket" | "purchase";
  ticketId: string;
  ticketNumber: number | undefined;
  ticketTitle: string;
  ticketDueDate: string | undefined;
  itemIndex: number;
  item: PurchaseLineItem;
  // Display vendor: explicit item.vendor if present, otherwise inferred from URL.
  // Used for grouping and the visible "Vendor" column.
  displayVendor: string;
  // Order-date proxy (record purchased/modified date) for the Awaiting Receipt sort.
  orderedAt?: string;
  // Parent-request context, shown in the queue's Requester + Approval columns.
  requester?: string;
  department?: string;
  requestedDate?: string; // when the request was created
  approvedDate?: string;
  approver?: string;
  // Who marked the item(s) received (record-level receiver). Shown in Recently Received.
  receivedBy?: string;
}

const HOSTNAME_TO_VENDOR: Record<string, string> = {
  "amazon.com": "Amazon",
  "smile.amazon.com": "Amazon",
  "a.co": "Amazon",
  "amzn.com": "Amazon",
  "bhphotovideo.com": "B&H Photo",
  "walmart.com": "Walmart",
  "homedepot.com": "Home Depot",
  "lowes.com": "Lowe's",
  "newegg.com": "Newegg",
  "bestbuy.com": "Best Buy",
  "target.com": "Target",
  "costco.com": "Costco",
  "midea.com": "Midea",
  "staples.com": "Staples",
  "officedepot.com": "Office Depot",
  "grainger.com": "Grainger",
  "uline.com": "Uline",
  "ebay.com": "eBay",
};

export function inferVendorFromUrl(url: string | undefined): string {
  if (!url) return "(Unspecified)";
  try {
    // Strip protocol-less inputs by adding https:// for parsing.
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
    if (HOSTNAME_TO_VENDOR[host]) return HOSTNAME_TO_VENDOR[host];
    // Try matching ignoring leading subdomain (e.g. checkout.amazon.com).
    const parts = host.split(".");
    for (let i = 1; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join(".");
      if (HOSTNAME_TO_VENDOR[candidate]) return HOSTNAME_TO_VENDOR[candidate];
    }
    return host;
  } catch {
    return "(Unspecified)";
  }
}

// Group rows by displayVendor for the table render.
export function groupByVendor(rows: QueueRow[]): { vendor: string; rows: QueueRow[] }[] {
  const map = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const key = row.displayVendor || "(Unspecified)";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([vendor, rows]) => ({ vendor, rows }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor));
}
