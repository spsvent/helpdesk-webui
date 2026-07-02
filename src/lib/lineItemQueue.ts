// Pure helpers for the Awaiting Order / Awaiting Receipt queue pages.
// Flatten line items across tickets, infer vendor from URL hostname, group by vendor.

import type { Ticket, PurchaseLineItem } from "@/types/ticket";

// One row of the flat queue. Carries the parent record context plus the
// item itself (and its index within the parent's lineItems array, so a
// bulk write can target the correct slot).
export interface QueueRow {
  // Row provenance: a legacy purchase ticket (Tickets list) or a request from
  // the purchase module (PurchaseRequests list — see src/modules/purchase/
  // queueRows.ts). The queue pages route write-backs to the matching service
  // by this field; item ids are NOT unique across the two lists.
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
  // Parent-request context, shown in the queue's Requester + Approval columns so
  // the purchaser can see who asked and that it was approved. Optional because
  // producers supply what they have — module purchase requests carry no
  // department, and future producers may omit some fields.
  requester?: string;
  department?: string;
  requestedDate?: string; // when the request was created
  approvedDate?: string;
  approver?: string;
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

function buildRow(ticket: Ticket, item: PurchaseLineItem, idx: number): QueueRow {
  const explicit = item.vendor?.trim();
  // Prefer the migrated original requester name when present (mirrors how the
  // ticket detail derives the requester), else the Person field's display name.
  const requester = ticket.originalRequester
    ? ticket.originalRequester.split("<")[0].trim() || ticket.originalRequester
    : ticket.requester.displayName;
  return {
    source: "ticket",
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketTitle: ticket.title,
    ticketDueDate: ticket.dueDate,
    itemIndex: idx,
    item,
    displayVendor: explicit && explicit.length > 0 ? explicit : inferVendorFromUrl(item.url),
    requester,
    department: ticket.problemType,
    requestedDate: ticket.created,
    approvedDate: ticket.approvalDate,
    approver: ticket.approvedBy?.displayName,
  };
}

// An item is "awaiting order" when the ticket has been approved AND the item
// hasn't been ordered yet. We treat presence of either vendor or orderNum as
// "ordered" since Approve & Order may set them and the Purchaser flow requires
// both to mark complete.
export function flattenUnorderedItems(tickets: Ticket[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const ticket of tickets) {
    if (!ticket.isPurchaseRequest) continue;
    if (ticket.approvalStatus !== "Approved") continue;
    const status = ticket.purchaseStatus;
    // Skip tickets fully done (Received) or denied
    if (status === "Received" || status === "Denied" || status === "Pending Approval") continue;
    const items = ticket.purchaseLineItems ?? [];
    items.forEach((item, idx) => {
      const hasVendor = Boolean(item.vendor?.trim());
      const hasOrderNum = Boolean(item.orderNum?.trim());
      if (hasVendor && hasOrderNum) return; // already ordered
      rows.push(buildRow(ticket, item, idx));
    });
  }
  return rows;
}

// An item is "awaiting receipt" when it HAS been ordered (vendor + orderNum)
// but hasn't been received (no receivedDate or partial receivedQty).
export function flattenUnreceivedItems(tickets: Ticket[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const ticket of tickets) {
    if (!ticket.isPurchaseRequest) continue;
    if (ticket.purchaseStatus === "Pending Approval" || ticket.purchaseStatus === "Denied") continue;
    const items = ticket.purchaseLineItems ?? [];
    items.forEach((item, idx) => {
      const ordered = Boolean(item.vendor?.trim() && item.orderNum?.trim());
      if (!ordered) return;
      const fullyReceived = Boolean(item.receivedDate) && (item.receivedQty ?? 0) >= item.qty;
      if (fullyReceived) return;
      rows.push(buildRow(ticket, item, idx));
    });
  }
  return rows;
}

// Recently-completed history view: items ordered (or received) in the last
// `daysBack` days. Used by the page's "Recently" tab.
export function flattenRecentlyOrdered(tickets: Ticket[], daysBack = 30): QueueRow[] {
  const cutoff = Date.now() - daysBack * 86400000;
  const rows: QueueRow[] = [];
  for (const ticket of tickets) {
    if (!ticket.isPurchaseRequest) continue;
    const items = ticket.purchaseLineItems ?? [];
    items.forEach((item, idx) => {
      const ordered = Boolean(item.vendor?.trim() && item.orderNum?.trim());
      if (!ordered) return;
      // Use ticket modified date as a proxy — line items don't carry their
      // own ordered-on timestamp.
      const when = ticket.modified ? new Date(ticket.modified).getTime() : 0;
      if (when < cutoff) return;
      rows.push(buildRow(ticket, item, idx));
    });
  }
  return rows;
}

export function flattenRecentlyReceived(tickets: Ticket[], daysBack = 30): QueueRow[] {
  const cutoff = Date.now() - daysBack * 86400000;
  const rows: QueueRow[] = [];
  for (const ticket of tickets) {
    if (!ticket.isPurchaseRequest) continue;
    const items = ticket.purchaseLineItems ?? [];
    items.forEach((item, idx) => {
      if (!item.receivedDate) return;
      const when = new Date(item.receivedDate).getTime();
      if (Number.isNaN(when) || when < cutoff) return;
      rows.push(buildRow(ticket, item, idx));
    });
  }
  return rows;
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
