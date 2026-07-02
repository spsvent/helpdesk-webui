// Purchase-module rows for the shared Awaiting Order / Awaiting Receipt queues.
//
// The queue pages historically flattened only Tickets-list purchase requests
// (src/lib/lineItemQueue.ts), so requests living in the PurchaseRequests list
// were invisible to purchasers — even though the approval email sends them to
// /orders. These flatteners mirror the ticket ones item-for-item, emitting the
// same QueueRow shape tagged source:"purchase" so the pages write order/receive
// actions back through THIS module's service (never the ticket update path).

import type { QueueRow } from "@/lib/lineItemQueue";
import { inferVendorFromUrl } from "@/lib/lineItemQueue";
import type { PurchaseLineItem, PurchaseRequest } from "./types";

function buildRow(pr: PurchaseRequest, item: PurchaseLineItem, idx: number): QueueRow {
  const explicit = item.vendor?.trim();
  return {
    source: "purchase",
    ticketId: pr.id,
    ticketNumber: pr.sourceTicketNumber, // set only for migrated records
    ticketTitle: pr.title,
    ticketDueDate: undefined, // purchase requests carry no due date
    itemIndex: idx,
    item,
    displayVendor: explicit && explicit.length > 0 ? explicit : inferVendorFromUrl(item.url),
    // Request context for the queue's Requester + Approval columns. Purchase
    // requests have no department (a ticket-only concept), so it's left blank.
    requester: pr.requesterName || pr.createdByName,
    requestedDate: pr.created,
    approvedDate: pr.approvalDate,
    approver: pr.approvedByName,
  };
}

// Mirrors flattenUnorderedItems: approved requests whose items lack vendor+orderNum.
export function purchaseUnorderedRows(prs: PurchaseRequest[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const pr of prs) {
    if (pr.approvalStatus !== "Approved") continue;
    const status = pr.purchaseStatus;
    // Skip requests fully done (Received) or denied
    if (status === "Received" || status === "Denied" || status === "Pending Approval") continue;
    pr.lineItems.forEach((item, idx) => {
      const hasVendor = Boolean(item.vendor?.trim());
      const hasOrderNum = Boolean(item.orderNum?.trim());
      if (hasVendor && hasOrderNum) return; // already ordered
      rows.push(buildRow(pr, item, idx));
    });
  }
  return rows;
}

// Mirrors flattenUnreceivedItems: ordered items not (fully) received yet.
export function purchaseUnreceivedRows(prs: PurchaseRequest[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const pr of prs) {
    if (pr.purchaseStatus === "Pending Approval" || pr.purchaseStatus === "Denied") continue;
    pr.lineItems.forEach((item, idx) => {
      const ordered = Boolean(item.vendor?.trim() && item.orderNum?.trim());
      if (!ordered) return;
      const fullyReceived = Boolean(item.receivedDate) && (item.receivedQty ?? 0) >= item.qty;
      if (fullyReceived) return;
      rows.push(buildRow(pr, item, idx));
    });
  }
  return rows;
}

// Mirrors flattenRecentlyOrdered (modified date as the ordered-on proxy).
export function purchaseRecentlyOrderedRows(prs: PurchaseRequest[], daysBack = 30): QueueRow[] {
  const cutoff = Date.now() - daysBack * 86400000;
  const rows: QueueRow[] = [];
  for (const pr of prs) {
    pr.lineItems.forEach((item, idx) => {
      const ordered = Boolean(item.vendor?.trim() && item.orderNum?.trim());
      if (!ordered) return;
      const when = pr.modified ? new Date(pr.modified).getTime() : 0;
      if (when < cutoff) return;
      rows.push(buildRow(pr, item, idx));
    });
  }
  return rows;
}

// Mirrors flattenRecentlyReceived.
export function purchaseRecentlyReceivedRows(prs: PurchaseRequest[], daysBack = 30): QueueRow[] {
  const cutoff = Date.now() - daysBack * 86400000;
  const rows: QueueRow[] = [];
  for (const pr of prs) {
    pr.lineItems.forEach((item, idx) => {
      if (!item.receivedDate) return;
      const when = new Date(item.receivedDate).getTime();
      if (Number.isNaN(when) || when < cutoff) return;
      rows.push(buildRow(pr, item, idx));
    });
  }
  return rows;
}
