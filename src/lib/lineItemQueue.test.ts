import { describe, it, expect } from "vitest";
import { flattenUnorderedItems } from "./lineItemQueue";
import type { Ticket } from "@/types/ticket";

// Minimal approved purchase-request ticket with one un-ordered line item.
function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: "1",
    title: "Bridge netting",
    isPurchaseRequest: true,
    approvalStatus: "Approved",
    purchaseStatus: "Approved",
    requester: { displayName: "Jane Doe", email: "jane@x.com" },
    problemType: "Operations",
    created: "2026-06-28T10:00:00Z",
    approvalDate: "2026-06-30",
    approvedBy: { displayName: "M. Gonzalez", email: "mg@x.com" },
    purchaseLineItems: [{ qty: 2, cost: 45 }],
    ...overrides,
  } as unknown as Ticket;
}

describe("flattenUnorderedItems request context", () => {
  it("carries requester, department, requested/approved dates and approver onto each row", () => {
    const rows = flattenUnorderedItems([ticket({})]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.requester).toBe("Jane Doe");
    expect(r.department).toBe("Operations");
    expect(r.requestedDate).toBe("2026-06-28T10:00:00Z");
    expect(r.approvedDate).toBe("2026-06-30");
    expect(r.approver).toBe("M. Gonzalez");
  });

  it("prefers the migrated originalRequester name when present", () => {
    const rows = flattenUnorderedItems([ticket({ originalRequester: "Rob Vance <rob@x.com>" })]);
    expect(rows[0].requester).toBe("Rob Vance");
  });

  it("leaves approver/approvedDate undefined when the ticket carries none", () => {
    const rows = flattenUnorderedItems([ticket({ approvedBy: undefined, approvalDate: undefined })]);
    expect(rows[0].approver).toBeUndefined();
    expect(rows[0].approvedDate).toBeUndefined();
  });
});
