"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { OrderCatalogItem, OrderCatalogWritable } from "../catalogTypes";
import {
  listCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  deactivateCatalogItem,
  distinctVendors,
  isCatalogConfigured,
} from "../catalogService";

// Who can maintain the catalog: admins and purchasers (they know vendors/prices).
function canManageCatalog(role: string | undefined, isPurchaser: boolean | undefined): boolean {
  return role === "admin" || !!isPurchaser;
}

interface Draft {
  name: string;
  category: string;
  department: string;
  vendor: string;
  sku: string;
  size: string;
  unitPrice: string;
  url: string;
  notes: string;
  active: boolean;
}

const EMPTY: Draft = {
  name: "",
  category: "",
  department: "Shared",
  vendor: "",
  sku: "",
  size: "",
  unitPrice: "",
  url: "",
  notes: "",
  active: true,
};

function toDraft(it: OrderCatalogItem): Draft {
  return {
    name: it.name,
    category: it.category ?? "",
    department: it.department,
    vendor: it.vendor ?? "",
    sku: it.sku ?? "",
    size: it.size ?? "",
    unitPrice: it.unitPrice != null ? String(it.unitPrice) : "",
    url: it.url ?? "",
    notes: it.notes ?? "",
    active: it.active,
  };
}

// Empty strings clear the stored column (null), so blanking a field on edit sticks.
function draftToWritable(d: Draft): OrderCatalogWritable {
  return {
    name: d.name.trim(),
    category: d.category.trim() || null,
    department: d.department.trim() || "Shared",
    vendor: d.vendor.trim() || null,
    sku: d.sku.trim() || null,
    size: d.size.trim() || null,
    unitPrice: d.unitPrice.trim() === "" ? null : Number(d.unitPrice),
    url: d.url.trim() || null,
    notes: d.notes.trim() || null,
    active: d.active,
  };
}

const inputClass =
  "w-full px-2 py-1.5 border border-border rounded-md text-sm bg-bg-base focus:outline-none focus:ring-2 focus:ring-brand-primary";

export default function CatalogAdmin() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions, loading: rbacLoading } = useRBAC();

  const [items, setItems] = useState<OrderCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dept, setDept] = useState("");
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function reload() {
    if (!account) return;
    const client = getGraphClient(instance, account);
    setItems(await listCatalogItems(client, { includeInactive: true }));
  }

  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        await reload();
      } catch (e) {
        console.error("[CatalogAdmin] load failed:", e);
        setLoadError("Could not load the catalog. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, instance]);

  const departments = useMemo(
    () => Array.from(new Set(items.map((i) => i.department).filter(Boolean))).sort(),
    [items]
  );
  const vendors = useMemo(() => distinctVendors(items), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (showInactive ? true : i.active))
      .filter((i) => (dept ? i.department === dept : true))
      .filter((i) => (vendor ? (i.vendor || "") === vendor : true))
      .filter((i) => (q ? `${i.name} ${i.sku ?? ""} ${i.category ?? ""}`.toLowerCase().includes(q) : true))
      .sort((a, b) => a.department.localeCompare(b.department) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [items, showInactive, dept, vendor, search]);

  function startAdd() {
    setDraft({ ...EMPTY, department: dept || "Shared" });
    setEditingId("new");
    setFormError(null);
  }
  function startEdit(it: OrderCatalogItem) {
    setDraft(toDraft(it));
    setEditingId(it.id);
    setFormError(null);
  }
  function cancel() {
    setEditingId(null);
    setFormError(null);
  }

  async function save() {
    if (!account) return;
    if (!draft.name.trim()) return setFormError("Item name is required.");
    if (!draft.department.trim()) return setFormError("Department is required.");
    if (draft.unitPrice.trim() !== "" && isNaN(Number(draft.unitPrice))) return setFormError("Price must be a number.");
    setSaving(true);
    setFormError(null);
    try {
      const client = getGraphClient(instance, account);
      const writable = draftToWritable(draft);
      if (editingId === "new") await createCatalogItem(client, writable);
      else if (editingId) await updateCatalogItem(client, editingId, writable);
      await reload();
      setEditingId(null);
    } catch (e) {
      console.error("[CatalogAdmin] save failed:", e);
      setFormError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(it: OrderCatalogItem) {
    if (!account) return;
    const client = getGraphClient(instance, account);
    if (it.active) await deactivateCatalogItem(client, it.id);
    else await updateCatalogItem(client, it.id, { active: true });
    await reload();
  }

  if (rbacLoading || loading) return <div className="p-8"><LoadingSpinner /></div>;
  if (!isCatalogConfigured()) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">The order catalog isn’t set up yet.</div>;
  }
  if (!canManageCatalog(permissions?.role, permissions?.isPurchaser)) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">You don’t have permission to manage the catalog.</div>;
  }
  if (loadError) return <div className="max-w-2xl mx-auto p-8 text-sm text-red-600">{loadError}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Order Catalog</h1>
          <p className="mt-1 text-sm text-text-secondary">Add, edit, price, and retire the standard reorder items that appear on the order sheet.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/purchase" className="text-sm text-brand-primary underline">Back</Link>
          <button type="button" onClick={startAdd} className="px-3 py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light">
            + Add item
          </button>
        </div>
      </div>

      {/* Editor panel */}
      {editingId && (
        <div className="mt-4 rounded-lg border border-border bg-bg-subtle p-4">
          <h2 className="text-sm font-semibold text-text-primary">{editingId === "new" ? "New item" : "Edit item"}</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-text-secondary">Name*
              <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="text-xs text-text-secondary">Department*
              <input className={inputClass} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="Facilities / Shared / …" />
            </label>
            <label className="text-xs text-text-secondary">Category
              <input className={inputClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Bags, Cleaners, …" />
            </label>
            <label className="text-xs text-text-secondary">Vendor
              <input className={inputClass} list="catalog-vendors" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
              <datalist id="catalog-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            </label>
            <label className="text-xs text-text-secondary">SKU / product code
              <input className={inputClass} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
            </label>
            <label className="text-xs text-text-secondary">Size / unit
              <input className={inputClass} value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} placeholder="CASE, 1 GAL, 24 X 32…" />
            </label>
            <label className="text-xs text-text-secondary">Unit price ($)
              <input className={inputClass} inputMode="decimal" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} placeholder="0.00" />
            </label>
            <label className="text-xs text-text-secondary">Product URL
              <input className={inputClass} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Optional" />
            </label>
            <label className="text-xs text-text-secondary sm:col-span-2">Notes
              <input className={inputClass} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active (shown on the order sheet)
            </label>
          </div>
          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel} disabled={saving} className="px-4 py-2 bg-bg-card text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select className={inputClass + " w-auto"} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className={inputClass + " w-auto"} value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className={inputClass + " flex-1 min-w-[10rem]"} placeholder="Search name, SKU, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <p className="mt-2 text-xs text-text-secondary">{filtered.length} item{filtered.length === 1 ? "" : "s"}</p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-subtle text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Dept</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium text-right">Price</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} className={"border-t border-border " + (it.active ? "" : "opacity-50")}>
                <td className="px-3 py-2 text-text-primary">
                  {it.name}
                  <span className="text-text-secondary"> · {it.category || "—"} · {it.size || "—"}</span>
                </td>
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{it.department}</td>
                <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{it.vendor || "—"}</td>
                <td className="px-3 py-2 text-text-secondary font-mono text-xs">{it.sku || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{it.unitPrice != null ? `$${it.unitPrice.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => startEdit(it)} className="text-brand-primary hover:underline text-xs">Edit</button>
                  <span className="text-border mx-1.5">|</span>
                  <button type="button" onClick={() => toggleActive(it)} className="text-text-secondary hover:underline text-xs">
                    {it.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-text-secondary">No items match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
