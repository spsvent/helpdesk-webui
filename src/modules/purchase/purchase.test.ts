import { describe, it, expect } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { mapToPurchase, parsePurchaseLineItems } from "./types";
import { isSafeItemUrl, validateLineItem } from "./lineItems";
import { mapTicketItemToPurchase, verifyMigration } from "./migration";
import { canEditPurchase, isPurchaseEditable } from "./access";
import { purchaseUnorderedRows, purchaseUnreceivedRows } from "./queueRows";
import type { PurchaseRequest } from "./types";
import { fetchAllListItems } from "@/shared/listItems";
import type { SharePointListItem } from "@/shared/spTypes";
import type { UserPermissions } from "@/types/rbac";

function ticketItem(fields: Record<string, unknown>, id = "42"): SharePointListItem {
  return {
    id,
    fields,
    createdDateTime: "2026-06-01T00:00:00Z",
    lastModifiedDateTime: "2026-06-02T00:00:00Z",
    createdBy: { user: { id: "u1", displayName: "PM", email: "pm@x.com" } },
  };
}

describe("parsePurchaseLineItems (dual-read)", () => {
  it("prefers the canonical JSON column", () => {
    const items = parsePurchaseLineItems({
      PurchaseLineItemsJSON: JSON.stringify([{ name: "Cable", qty: 2, cost: 5 }]),
    });
    expect(items).toEqual([{ name: "Cable", qty: 2, cost: 5 }]);
  });
  it("falls back to legacy singular columns", () => {
    const items = parsePurchaseLineItems({
      PurchaseItemUrl: "http://x/item",
      PurchaseQuantity: 3,
      PurchaseEstCostPerItem: 10,
      PurchaseVendor: "Acme",
    });
    expect(items).toEqual([{ url: "http://x/item", qty: 3, cost: 10, vendor: "Acme" }]);
  });
  it("returns [] when there is nothing", () => {
    expect(parsePurchaseLineItems({})).toEqual([]);
  });
});

describe("validateLineItem / isSafeItemUrl (URL must be http(s) — it renders as a raw href)", () => {
  it("accepts http/https URLs and rejects everything else", () => {
    expect(isSafeItemUrl("https://vendor.example/item")).toBe(true);
    expect(isSafeItemUrl("http://vendor.example/item")).toBe(true);
    // eslint-disable-next-line no-script-url
    expect(isSafeItemUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeItemUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeItemUrl("vendor.example/item")).toBe(false); // unparseable (no scheme)
  });

  it("rejects an item whose URL isn't a valid http(s) link", () => {
    // eslint-disable-next-line no-script-url
    expect(validateLineItem({ url: "javascript:alert(1)", qty: 1, cost: 0 })).toMatch(/http/);
    expect(validateLineItem({ name: "Cable", url: "not a url", qty: 1, cost: 0 })).toMatch(/http/);
  });

  it("requires a product link (URL) on every item", () => {
    // Name alone is no longer enough — a link is required.
    expect(validateLineItem({ name: "Cable", qty: 1, cost: 0 })).toMatch(/link|URL/i);
    expect(validateLineItem({ name: "Cable", url: "  ", qty: 1, cost: 0 })).toMatch(/link|URL/i);
    // A valid http(s) link passes.
    expect(validateLineItem({ url: "https://vendor.example/item", qty: 1, cost: 0 })).toBeNull();
  });
});

function perms(p: Partial<UserPermissions>): UserPermissions {
  return {
    role: "user",
    email: "",
    displayName: "",
    groupMemberships: [],
    editableDepartments: [],
    subtypeRestrictions: [],
    canDelete: false,
    canEditAllFields: false,
    canSeeAllTickets: false,
    canEditOtherDepartment: false,
    isPurchaser: false,
    isInventory: false,
    visibilityKeywordMatch: false,
    ...p,
  };
}

describe("canEditPurchase / isPurchaseEditable (edit + resubmit gate)", () => {
  const owned = { createdByEmail: "buyer@x.com", requesterEmail: "buyer@x.com" };

  it("owner (creator/requester) or admin only", () => {
    expect(canEditPurchase(owned, perms({ email: "buyer@x.com" }))).toBe(true);
    expect(canEditPurchase(owned, perms({ email: "other@x.com" }))).toBe(false);
    expect(canEditPurchase(owned, perms({ role: "admin", email: "gm@x.com" }))).toBe(true);
    expect(canEditPurchase(owned, null)).toBe(false);
  });

  it("editable only for Changes Requested or a never-submitted record", () => {
    expect(isPurchaseEditable({ approvalStatus: "Changes Requested", purchaseStatus: "Pending Approval" })).toBe(true);
    expect(isPurchaseEditable({ approvalStatus: "None", purchaseStatus: "Pending Approval" })).toBe(true);
    // In (or past) the approval gate → immutable.
    expect(isPurchaseEditable({ approvalStatus: "Pending", purchaseStatus: "Pending Approval" })).toBe(false);
    expect(isPurchaseEditable({ approvalStatus: "Approved", purchaseStatus: "Approved" })).toBe(false);
    expect(isPurchaseEditable({ approvalStatus: "Denied", purchaseStatus: "Denied" })).toBe(false);
    // A migrated record that already moved through fulfillment isn't editable.
    expect(isPurchaseEditable({ approvalStatus: "None", purchaseStatus: "Received" })).toBe(false);
  });
});

describe("queueRows (purchase-module rows for the order/receive queues)", () => {
  const pr = (overrides: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
    id: "7",
    title: "Buy cables",
    purchaseStatus: "Approved",
    lineItems: [{ name: "HDMI", qty: 4, cost: 8 }],
    approvalStatus: "Approved",
    requesterName: "Buyer",
    requesterEmail: "buyer@x.com",
    created: "2026-06-01T00:00:00Z",
    modified: "2026-06-02T00:00:00Z",
    createdByEmail: "buyer@x.com",
    createdByName: "Buyer",
    ...overrides,
  });

  it("awaiting order: approved + not yet ordered, tagged source:purchase", () => {
    const rows = purchaseUnorderedRows([pr()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("purchase");
    expect(rows[0].ticketId).toBe("7");
    expect(rows[0].itemIndex).toBe(0);
  });

  it("awaiting order: skips unapproved, denied, and already-ordered items", () => {
    expect(purchaseUnorderedRows([pr({ approvalStatus: "Pending", purchaseStatus: "Pending Approval" })])).toEqual([]);
    expect(purchaseUnorderedRows([pr({ approvalStatus: "Denied", purchaseStatus: "Denied" })])).toEqual([]);
    expect(purchaseUnorderedRows([pr({ lineItems: [{ name: "HDMI", qty: 4, cost: 8, vendor: "Acme", orderNum: "PO-1" }] })])).toEqual([]);
  });

  it("awaiting receipt: ordered but not (fully) received", () => {
    const ordered = { name: "HDMI", qty: 4, cost: 8, vendor: "Acme", orderNum: "PO-1" };
    expect(purchaseUnreceivedRows([pr({ purchaseStatus: "Ordered", lineItems: [ordered] })])).toHaveLength(1);
    // Partial receipt still shows; full receipt drops out.
    expect(purchaseUnreceivedRows([pr({ purchaseStatus: "Ordered", lineItems: [{ ...ordered, receivedDate: "2026-06-20", receivedQty: 2 }] })])).toHaveLength(1);
    expect(purchaseUnreceivedRows([pr({ purchaseStatus: "Received", lineItems: [{ ...ordered, receivedDate: "2026-06-20", receivedQty: 4 }] })])).toEqual([]);
    // Never-ordered items belong to the order queue, not this one.
    expect(purchaseUnreceivedRows([pr()])).toEqual([]);
  });
});

describe("fetchAllListItems (paged list reads)", () => {
  // Graph pages list reads (~200 items) behind @odata.nextLink; a single-GET read
  // truncates, which broke the migration's "already migrated" idempotency set.
  it("follows @odata.nextLink until exhausted and returns every item", async () => {
    const page = (ids: string[], nextLink?: string) => ({
      value: ids.map((id) => ticketItem({}, id)),
      ...(nextLink ? { "@odata.nextLink": nextLink } : {}),
    });
    const pages: Record<string, unknown> = {
      "/items?page=1": page(["1", "2"], "/items?page=2"),
      "/items?page=2": page(["3"]),
    };
    const requested: string[] = [];
    const client = {
      api: (url: string) => ({
        get: async () => {
          requested.push(url);
          return pages[url];
        },
      }),
    } as unknown as Client;

    const items = await fetchAllListItems(client, "/items?page=1");
    expect(requested).toEqual(["/items?page=1", "/items?page=2"]);
    expect(items.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });
});

describe("mapTicketItemToPurchase (migration mapper)", () => {
  const item = ticketItem({
    Title: "Buy cables",
    TicketNumber: 137,
    PurchaseStatus: "Approved",
    PurchaseLineItemsJSON: JSON.stringify([{ name: "HDMI", qty: 4, cost: 8 }]),
    PurchaseJustification: "AV needs them",
    ApprovalStatus: "Approved",
    ApprovedByEmail: "gm@x.com",
    Requester: { Email: "buyer@x.com", LookupValue: "Buyer" },
    ParticipantEmails: "watcher@x.com; other@x.com",
  });

  it("maps ticket fields + preserves source ticket #/id", () => {
    const input = mapTicketItemToPurchase(item);
    expect(input.title).toBe("Buy cables");
    expect(input.purchaseStatus).toBe("Approved");
    expect(input.lineItems).toEqual([{ name: "HDMI", qty: 4, cost: 8 }]);
    expect(input.justification).toBe("AV needs them");
    expect(input.approvalStatus).toBe("Approved");
    expect(input.requesterEmail).toBe("buyer@x.com");
    expect(input.requesterName).toBe("Buyer");
    expect(input.sourceTicketNumber).toBe(137);
    expect(input.sourceTicketId).toBe("42");
  });

  it("carries ticket participants over (the notification audience)", () => {
    expect(mapTicketItemToPurchase(item).participantEmails).toEqual(["watcher@x.com", "other@x.com"]);
    // No participants → omitted entirely, not written as an empty column.
    expect(mapTicketItemToPurchase(ticketItem({ Title: "x" })).participantEmails).toBeUndefined();
  });

  it("falls back to the creator when there is no Requester person field", () => {
    const input = mapTicketItemToPurchase(ticketItem({ Title: "x", PurchaseStatus: "Denied" }));
    expect(input.requesterEmail).toBe("pm@x.com");
    expect(input.requesterName).toBe("PM");
  });

  it("round-trips through mapToPurchase (source == migrated)", () => {
    const input = mapTicketItemToPurchase(item);
    // Simulate the created PR list item's fields.
    const migratedFields = {
      Title: input.title,
      PurchaseStatus: input.purchaseStatus,
      PurchaseLineItemsJSON: JSON.stringify(input.lineItems),
      SourceTicketId: input.sourceTicketId,
      SourceTicketNumber: input.sourceTicketNumber,
      RequesterEmail: input.requesterEmail,
      ParticipantEmails: (input.participantEmails || []).join("; "),
    };
    expect(verifyMigration(input, migratedFields)).toEqual([]);
    const pr = mapToPurchase(ticketItem(migratedFields, "900"));
    expect(pr.title).toBe("Buy cables");
    expect(pr.lineItems).toEqual([{ name: "HDMI", qty: 4, cost: 8 }]);
    expect(pr.sourceTicketNumber).toBe(137);
    expect(pr.participantEmails).toEqual(["watcher@x.com", "other@x.com"]);
  });

  it("verifyMigration flags a mismatch", () => {
    const input = mapTicketItemToPurchase(item);
    expect(verifyMigration(input, { Title: "WRONG", PurchaseStatus: "Approved" }).length).toBeGreaterThan(0);
  });
});
