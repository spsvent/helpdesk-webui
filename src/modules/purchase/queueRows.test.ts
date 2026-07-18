import { describe, it, expect } from "vitest";
import { purchaseUnorderedRows } from "./queueRows";
import type { PurchaseRequest } from "./types";

// Minimal approved purchase-module request with one un-ordered line item.
function pr(overrides: Partial<PurchaseRequest>): PurchaseRequest {
  return {
    id: "p1",
    title: "Netting",
    purchaseStatus: "Approved",
    approvalStatus: "Approved",
    lineItems: [{ qty: 1, cost: 10 }],
    requesterName: "Jane Doe",
    createdByName: "Jane Doe",
    createdByEmail: "j@x.com",
    requesterEmail: "j@x.com",
    created: "2026-06-28T10:00:00Z",
    modified: "2026-06-29T10:00:00Z",
    approvalDate: "2026-06-30",
    approvedByName: "M. Gonzalez",
    ...overrides,
  } as unknown as PurchaseRequest;
}

describe("purchaseUnorderedRows request context", () => {
  it("populates requester/dates/approver, tags source=purchase, and leaves department blank", () => {
    const rows = purchaseUnorderedRows([pr({})]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.source).toBe("purchase");
    expect(r.requester).toBe("Jane Doe");
    expect(r.department).toBeUndefined(); // purchase requests have no department
    expect(r.requestedDate).toBe("2026-06-28T10:00:00Z");
    expect(r.approvedDate).toBe("2026-06-30");
    expect(r.approver).toBe("M. Gonzalez");
  });

  it("falls back to createdByName when requesterName is empty", () => {
    const rows = purchaseUnorderedRows([pr({ requesterName: "" })]);
    expect(rows[0].requester).toBe("Jane Doe");
  });

  it("carries the approver's decision note onto the queue row (ticket #479)", () => {
    const rows = purchaseUnorderedRows([
      pr({ approvalNotes: "Color prints can go to the main office printer" }),
    ]);
    expect(rows[0].approvalNotes).toBe("Color prints can go to the main office printer");
  });

  it("leaves approvalNotes undefined when the approver left no note", () => {
    const rows = purchaseUnorderedRows([pr({})]);
    expect(rows[0].approvalNotes).toBeUndefined();
  });
});
