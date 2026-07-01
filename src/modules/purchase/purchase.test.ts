import { describe, it, expect } from "vitest";
import { mapToPurchase, parsePurchaseLineItems } from "./types";
import { mapTicketItemToPurchase, verifyMigration } from "./migration";
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
    };
    expect(verifyMigration(input, migratedFields)).toEqual([]);
    const pr = mapToPurchase(ticketItem(migratedFields, "900"));
    expect(pr.title).toBe("Buy cables");
    expect(pr.lineItems).toEqual([{ name: "HDMI", qty: 4, cost: 8 }]);
    expect(pr.sourceTicketNumber).toBe(137);
  });

  it("verifyMigration flags a mismatch", () => {
    const input = mapTicketItemToPurchase(item);
    expect(verifyMigration(input, { Title: "WRONG", PurchaseStatus: "Approved" }).length).toBeGreaterThan(0);
  });
});
