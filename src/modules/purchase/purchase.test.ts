import { describe, it, expect } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { mapToPurchase, parsePurchaseLineItems } from "./types";
import { mapTicketItemToPurchase, verifyMigration } from "./migration";
import { fetchAllListItems } from "@/shared/listItems";
import type { SharePointListItem } from "@/shared/spTypes";

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
