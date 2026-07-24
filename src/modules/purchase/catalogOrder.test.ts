import { describe, it, expect } from "vitest";
import type { OrderCatalogItem } from "./catalogTypes";
import type { PurchaseRequest } from "./types";
import {
  ALL_DEPARTMENTS,
  availableDepartments,
  buildOrderLineItems,
  buildReorderIndex,
  defaultDepartment,
  filterByDepartment,
  groupByCategory,
  orderDepartmentLabel,
  estimatedTotal,
} from "./catalogOrder";

function item(over: Partial<OrderCatalogItem> & { id: string }): OrderCatalogItem {
  return {
    name: "Item " + over.id,
    department: "Facilities",
    active: true,
    created: "",
    modified: "",
    createdByEmail: "",
    createdByName: "",
    ...over,
  };
}

function purchase(over: Partial<PurchaseRequest>): PurchaseRequest {
  return {
    id: "p",
    title: "",
    purchaseStatus: "Pending Approval",
    lineItems: [],
    approvalStatus: "Pending",
    requesterName: "",
    requesterEmail: "",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    createdByEmail: "",
    createdByName: "",
    ...over,
  };
}

describe("filterByDepartment", () => {
  const items = [
    item({ id: "1", department: "Facilities" }),
    item({ id: "2", department: "Retail" }),
    item({ id: "3", department: "Shared" }),
  ];
  it("includes Shared items alongside a specific department", () => {
    expect(filterByDepartment(items, "Facilities").map((i) => i.id)).toEqual(["1", "3"]);
  });
  it("shows everything for All", () => {
    expect(filterByDepartment(items, ALL_DEPARTMENTS)).toHaveLength(3);
  });
  it("Shared selection shows only shared", () => {
    expect(filterByDepartment(items, "Shared").map((i) => i.id)).toEqual(["3"]);
  });
});

describe("availableDepartments / defaultDepartment", () => {
  const items = [item({ id: "1", department: "Retail" }), item({ id: "2", department: "Shared" }), item({ id: "3", department: "Facilities" })];
  it("sorts departments alphabetically with Shared last", () => {
    expect(availableDepartments(items)).toEqual(["Facilities", "Retail", "Shared"]);
  });
  it("defaults to the user's first editable department present in the catalog", () => {
    expect(defaultDepartment(["Marketing", "Retail"], availableDepartments(items))).toBe("Retail");
  });
  it("falls back to All when the user has no matching department", () => {
    expect(defaultDepartment(["Marketing"], availableDepartments(items))).toBe(ALL_DEPARTMENTS);
  });
});

describe("groupByCategory", () => {
  it("groups in first-appearance order, sorted by sortOrder within a group", () => {
    const items = [
      item({ id: "1", category: "Bags", sortOrder: 20 }),
      item({ id: "2", category: "Cleaners", sortOrder: 10 }),
      item({ id: "3", category: "Bags", sortOrder: 10 }),
      item({ id: "4", category: undefined }),
    ];
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(["Bags", "Cleaners", "Other"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["3", "1"]);
  });
});

describe("buildReorderIndex", () => {
  it("keeps the most recent order per catalog item", () => {
    const purchases = [
      purchase({ created: "2026-02-01T00:00:00Z", lineItems: [{ qty: 5, cost: 0, catalogItemId: "c1" }] }),
      purchase({ created: "2026-03-01T00:00:00Z", lineItems: [{ qty: 8, cost: 0, catalogItemId: "c1" }] }),
      purchase({ created: "2026-01-01T00:00:00Z", lineItems: [{ qty: 99, cost: 0 }] }), // no catalogItemId — ignored
    ];
    const idx = buildReorderIndex(purchases);
    expect(idx.get("c1")).toEqual({ date: "2026-03-01T00:00:00Z", qty: 8 });
    expect(idx.size).toBe(1);
  });
});

describe("buildOrderLineItems", () => {
  const items = [
    item({ id: "a", name: "Bags", size: "CASE", sku: "X1", vendor: "Imperial Dade", unitPrice: 12 }),
    item({ id: "b", name: "Soap" }),
  ];
  it("only includes positive quantities and snapshots catalog fields", () => {
    const lines = buildOrderLineItems(items, { a: 3, b: 0 });
    expect(lines).toEqual([
      { name: "Bags", qty: 3, cost: 12, catalogItemId: "a", sku: "X1", unit: "CASE", vendor: "Imperial Dade" },
    ]);
  });
  it("defaults cost to 0 when the catalog price is unset", () => {
    const lines = buildOrderLineItems(items, { b: 2 });
    expect(lines[0]).toMatchObject({ name: "Soap", qty: 2, cost: 0, catalogItemId: "b" });
  });
});

describe("orderDepartmentLabel / estimatedTotal", () => {
  it("labels a single-department order with that department, else Multiple", () => {
    expect(orderDepartmentLabel([item({ id: "1", department: "Retail" })])).toBe("Retail");
    expect(
      orderDepartmentLabel([item({ id: "1", department: "Retail" }), item({ id: "2", department: "Facilities" })])
    ).toBe("Multiple");
  });
  it("sums qty * price, treating unset prices as 0", () => {
    const items = [item({ id: "a", unitPrice: 10 }), item({ id: "b" })];
    expect(estimatedTotal(items, { a: 2, b: 5 })).toBe(20);
  });
});
