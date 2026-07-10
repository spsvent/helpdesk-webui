"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { OrderCatalogItem } from "../catalogTypes";
import { canCreatePurchase } from "../access";
import { listCatalogItems, isCatalogConfigured } from "../catalogService";
import { createPurchase, listPurchases } from "../purchaseService";
import {
  ALL_DEPARTMENTS,
  availableDepartments,
  buildOrderLineItems,
  buildReorderIndex,
  defaultDepartment,
  estimatedTotal,
  filterByDepartment,
  groupByCategory,
  orderDepartmentLabel,
  type ReorderInfo,
} from "../catalogOrder";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export default function OrderSheetGrid() {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions, loading: rbacLoading } = useRBAC();
  const account = accounts[0];

  const [items, setItems] = useState<OrderCatalogItem[]>([]);
  const [reorderIdx, setReorderIdx] = useState<Map<string, ReorderInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dept, setDept] = useState<string>(ALL_DEPARTMENTS);
  const [category, setCategory] = useState<string>("");
  const [vendor, setVendor] = useState<string>("");
  const [search, setSearch] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load the catalog + past orders once. The reorder index is built from all
  // purchases so the "last ordered" hint is org-wide (per the design).
  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const client = getGraphClient(instance, account);
        const [catalog, purchases] = await Promise.all([listCatalogItems(client), listPurchases(client)]);
        setItems(catalog);
        setReorderIdx(buildReorderIndex(purchases));
        // Default the department filter to the user's own department (+ Shared).
        setDept(defaultDepartment(permissions?.editableDepartments ?? [], availableDepartments(catalog)));
      } catch (e) {
        console.error("[OrderSheetGrid] load failed:", e);
        setLoadError("Could not load the order catalog. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
    // permissions.editableDepartments only informs the initial default; re-running
    // on its change would stomp a user's manual filter choice, so it's intentionally
    // excluded from the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, instance]);

  const byDept = useMemo(() => filterByDepartment(items, dept), [items, dept]);
  const vendors = useMemo(
    () => Array.from(new Set(byDept.map((i) => i.vendor).filter((v): v is string => !!v))).sort(),
    [byDept]
  );
  const categories = useMemo(
    () => Array.from(new Set(byDept.map((i) => i.category).filter((c): c is string => !!c))).sort(),
    [byDept]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return byDept.filter((i) => {
      if (category && (i.category || "") !== category) return false;
      if (vendor && (i.vendor || "") !== vendor) return false;
      if (q && !`${i.name} ${i.sku ?? ""} ${i.size ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [byDept, category, vendor, search]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  const orderedItems = useMemo(() => items.filter((i) => (quantities[i.id] ?? 0) > 0), [items, quantities]);
  const estTotal = useMemo(() => estimatedTotal(items, quantities), [items, quantities]);

  function setQty(id: string, raw: string) {
    const n = parseInt(raw, 10);
    setQuantities((prev) => {
      const next = { ...prev };
      if (!raw || isNaN(n) || n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  async function handleSubmit() {
    if (!account) return setSubmitError("You must be signed in.");
    if (orderedItems.length === 0) return setSubmitError("Enter a quantity on at least one item.");
    setSubmitError(null);
    setSubmitting(true);
    try {
      const client = getGraphClient(instance, account);
      const lineItems = buildOrderLineItems(items, quantities);
      const deptLabel = orderDepartmentLabel(orderedItems);
      const today = new Date().toISOString().slice(0, 10);
      // Quiet by design: create the request (enters the GM approval queue as
      // Pending) but do NOT trigger the approval email — recurring orders surface
      // via the home badge + the >4-day digest instead.
      const pr = await createPurchase(client, {
        title: `${deptLabel || "Recurring"} order — ${today}`,
        orderType: "catalog",
        department: deptLabel || undefined,
        requesterName: account.name || account.username || "",
        requesterEmail: account.username || "",
        approvalRequestedDate: today,
        lineItems,
      });
      router.push(`/purchase/?id=${pr.id}`);
    } catch (e) {
      console.error("[OrderSheetGrid] submit failed:", e);
      setSubmitError("Could not submit the order. Please try again.");
      setSubmitting(false);
    }
  }

  if (rbacLoading || loading) return <div className="p-8"><LoadingSpinner /></div>;

  if (!isCatalogConfigured()) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">
        The order catalog isn’t set up yet. An administrator needs to create the OrderCatalog list.
        <Link href="/purchase" className="mt-3 block text-brand-primary underline">Back</Link>
      </div>
    );
  }
  if (!canCreatePurchase(permissions)) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">You don’t have permission to create orders.</div>;
  }
  if (loadError) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-red-600">{loadError}</div>;
  }

  const selectClass =
    "px-2 py-1.5 border border-border rounded-lg text-sm bg-bg-base focus:outline-none focus:ring-2 focus:ring-brand-primary";

  return (
    <div className="max-w-5xl mx-auto pb-28">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Recurring Order Sheet</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enter the quantities you need and submit. Your department is selected by default — switch it to order for
            another area. Orders go to a General Manager for approval.
          </p>
        </div>
        <Link href="/purchase" className="shrink-0 text-sm text-brand-primary underline">Back</Link>
      </div>

      {/* Filter bar */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select className={selectClass} value={dept} onChange={(e) => { setDept(e.target.value); setCategory(""); setVendor(""); }}>
          <option value={ALL_DEPARTMENTS}>All departments</option>
          {availableDepartments(items).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input
          className={selectClass + " flex-1 min-w-[10rem]"}
          placeholder="Search items, SKU, size…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(category || vendor || search) && (
          <button type="button" onClick={() => { setCategory(""); setVendor(""); setSearch(""); }} className="text-xs text-text-secondary underline">
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium text-right w-28">Order Qty</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-text-secondary">No items match these filters.</td></tr>
            )}
            {groups.map((group) => (
              <FragmentGroup
                key={group.category}
                group={group}
                quantities={quantities}
                reorderIdx={reorderIdx}
                focusedId={focusedId}
                setFocusedId={setFocusedId}
                setQty={setQty}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Sticky submit bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-bg-base/95 backdrop-blur px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{orderedItems.length}</span> item{orderedItems.length === 1 ? "" : "s"} selected
            {estTotal > 0 && <> · est. <span className="font-medium text-text-primary">{money(estTotal)}</span></>}
          </div>
          <div className="flex items-center gap-3">
            {submitError && <span className="text-sm text-red-600">{submitError}</span>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || orderedItems.length === 0}
              className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// One category section: a header row + its item rows. Split out so the reorder
// popover positioning stays local to a row.
function FragmentGroup({
  group,
  quantities,
  reorderIdx,
  focusedId,
  setFocusedId,
  setQty,
}: {
  group: { category: string; items: OrderCatalogItem[] };
  quantities: Record<string, number>;
  reorderIdx: Map<string, ReorderInfo>;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  setQty: (id: string, raw: string) => void;
}) {
  return (
    <>
      <tr className="bg-bg-subtle/60">
        <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {group.category}
        </td>
      </tr>
      {group.items.map((it) => {
        const reorder = reorderIdx.get(it.id);
        const qty = quantities[it.id] ?? 0;
        const focused = focusedId === it.id;
        return (
          <tr key={it.id} className={"border-t border-border " + (qty > 0 ? "bg-brand-primary/5" : "")}>
            <td className="px-3 py-2 text-text-primary">{it.name}</td>
            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{it.size || "—"}</td>
            <td className="px-3 py-2 text-text-secondary font-mono text-xs">{it.sku || "—"}</td>
            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{it.vendor || "—"}</td>
            <td className="px-3 py-2 text-right">
              <div className="relative inline-block">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={qty || ""}
                  onFocus={() => setFocusedId(it.id)}
                  onBlur={() => setFocusedId(null)}
                  onChange={(e) => setQty(it.id, e.target.value)}
                  className="w-20 px-2 py-1 text-right border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  placeholder="0"
                />
                {focused && (
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 z-10 whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-xs text-white shadow-lg">
                    {reorder
                      ? `Last ordered ${shortDate(reorder.date)} · qty ${reorder.qty}`
                      : "No previous orders"}
                  </div>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
