# Purchase Request Finetune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-item line items to purchase request tickets with per-item ordering and receiving, polish the GM approval UI, hide irrelevant fields on the new-ticket form, and move the approval flow from the right sidebar to the main page area.

**Architecture:** New JSON column `PurchaseLineItemsJSON` on the existing Tickets list stores the canonical line items. `mapToTicket` does dual-read: prefers the JSON, falls back to synthesizing a one-row array from the legacy single-item columns for backwards compatibility. Two new shared components (`LineItemsField` for editing, `LineItemsTable` for read-only display) keep markup DRY across the new-ticket form, GM approval, Purchaser flow, and details panel.

**Tech Stack:** React 18, Next.js 14 (App Router, static export), Tailwind CSS, MSAL.js 2.0, Microsoft Graph API.

**Spec:** `docs/superpowers/specs/2026-04-28-purchase-request-finetune-design.md`

**Testing strategy:** No automated test infrastructure (verified). Quality gates: `npx tsc --noEmit` after every code change, manual UI verification per task using `npm run dev`. Each task has explicit verification steps.

**Branching:** All work on `main` per user preference. One commit per task.

---

## Task 1: Add `PurchaseLineItemsJSON` column to SharePoint (manual)

**Files:** none (SharePoint admin step)

- [ ] **Step 1: Open the Tickets list**

Go to https://skyparksv.sharepoint.com/sites/helpdesk → Site contents → Tickets list → Settings.

- [ ] **Step 2: Add a new column**

Add column with these settings:
- **Name:** `PurchaseLineItemsJSON`
- **Type:** Multiple lines of text
- **Format:** Plain text (NOT rich text)
- **Number of lines for editing:** 6
- **Append changes to existing text:** No
- **Allow unlimited length:** Yes (or 16K+ if a limit must be set)
- **Required:** No
- **Default value:** (empty)

- [ ] **Step 3: Confirm the column appears in the list view**

Open the Tickets list. The new column should be visible (or addable via Add column → existing).

- [ ] **Step 4: Note for plan continuation**

No deployment / no env var change. The column is referenced by name in code in later tasks.

---

## Task 2: Add `PurchaseLineItem` type and dual-read in `mapToTicket`

**Files:**
- Modify: `src/types/ticket.ts`

- [ ] **Step 1: Add `PurchaseLineItem` interface**

In `src/types/ticket.ts`, add after the existing `PurchaseStatus` type (around line 7):

```ts
export interface PurchaseLineItem {
  // Entered by requester
  url?: string;
  name?: string;
  qty: number;
  cost: number;             // estimated $/item

  // Entered by GM on "Approve & Order", or by Purchaser later
  vendor?: string;
  orderNum?: string;
  actualCost?: number;      // actual $/item if it differs
  expectedDelivery?: string; // ISO date string

  // Entered by Inventory on receipt
  receivedDate?: string;    // ISO date string
  receivedQty?: number;
}
```

- [ ] **Step 2: Add `purchaseLineItems` to the `Ticket` interface**

Find the `Ticket` interface and add after the existing purchase fields (the legacy ones stay):

```ts
purchaseLineItems?: PurchaseLineItem[];   // canonical (new) — dual-read with legacy columns below
```

- [ ] **Step 3: Update `mapToTicket` to read JSON with legacy fallback**

In `mapToTicket`, after the existing `purchasedByEmail` mapping, add:

```ts
purchaseLineItems: parsePurchaseLineItems(fields),
```

Then add a new helper function in the same file (above `mapToTicket`):

```ts
function parsePurchaseLineItems(fields: Record<string, unknown>): PurchaseLineItem[] | undefined {
  const json = fields.PurchaseLineItemsJSON as string | undefined;
  if (json && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as PurchaseLineItem[];
    } catch {
      // Fall through to legacy fallback
    }
  }
  // Legacy fallback: synthesize a one-row array from the singular columns
  const legacyUrl = fields.PurchaseItemUrl as string | undefined;
  const legacyQty = fields.PurchaseQuantity as number | undefined;
  const legacyCost = fields.PurchaseEstCostPerItem as number | undefined;
  if (legacyUrl || legacyQty != null || legacyCost != null) {
    const legacyItem: PurchaseLineItem = {
      url: legacyUrl,
      qty: legacyQty ?? 1,
      cost: legacyCost ?? 0,
    };
    if (fields.PurchaseVendor) legacyItem.vendor = fields.PurchaseVendor as string;
    if (fields.PurchaseConfirmationNum) legacyItem.orderNum = fields.PurchaseConfirmationNum as string;
    if (fields.PurchaseActualCost != null) legacyItem.actualCost = fields.PurchaseActualCost as number;
    if (fields.PurchaseExpectedDelivery) legacyItem.expectedDelivery = fields.PurchaseExpectedDelivery as string;
    if (fields.ReceivedDate) legacyItem.receivedDate = fields.ReceivedDate as string;
    return [legacyItem];
  }
  return undefined;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/types/ticket.ts
git commit -m "Add PurchaseLineItem type and dual-read in mapToTicket"
```

---

## Task 3: Create `lineItemHelpers.ts` utility module

**Files:**
- Create: `src/lib/lineItemHelpers.ts`

- [ ] **Step 1: Create the helper module**

```ts
// src/lib/lineItemHelpers.ts
import type { PurchaseLineItem } from "@/types/ticket";

export function serializeLineItems(items: PurchaseLineItem[]): string {
  return JSON.stringify(items);
}

export function parseLineItems(json: string | undefined | null): PurchaseLineItem[] {
  if (!json || !json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PurchaseLineItem[]) : [];
  } catch {
    return [];
  }
}

export function computeEstimatedTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.cost, 0);
}

export function computeActualTotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => {
    const perItem = item.actualCost ?? item.cost;
    return sum + item.qty * perItem;
  }, 0);
}

export function allItemsOrdered(items: PurchaseLineItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => Boolean(item.vendor && item.orderNum));
}

export function allItemsReceived(items: PurchaseLineItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => Boolean(item.receivedDate) && (item.receivedQty ?? 0) >= item.qty);
}

export function distinctVendorCount(items: PurchaseLineItem[]): number {
  return new Set(items.map((i) => i.vendor).filter(Boolean)).size;
}

// Validate a row is fillable. Returns null if valid, otherwise an error string.
export function validateLineItem(item: Partial<PurchaseLineItem>): string | null {
  if (!item.name?.trim() && !item.url?.trim()) {
    return "Either a name or URL is required.";
  }
  if (item.qty == null || item.qty < 1) return "Quantity must be at least 1.";
  if (item.cost == null || item.cost < 0) return "Cost must be 0 or greater.";
  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/lineItemHelpers.ts
git commit -m "Add lineItemHelpers utility module"
```

---

## Task 4: Update `createTicket` to write `PurchaseLineItemsJSON`

**Files:**
- Modify: `src/lib/graphClient.ts:280-372` (the `createTicket` function and `CreateTicketData` type)

- [ ] **Step 1: Find `CreateTicketData` and update purchase fields**

Locate the type definition for `CreateTicketData` (search for `interface CreateTicketData` or `type CreateTicketData`). Replace the single-item purchase fields with a line items array. The new shape:

```ts
// Find existing purchase fields:
//   purchaseItemUrl?: string;
//   purchaseQuantity?: number;
//   purchaseEstCostPerItem?: number;
// And replace with:
purchaseLineItems?: PurchaseLineItem[];
purchaseJustification?: string;     // unchanged
purchaseProject?: string;            // unchanged
```

(Import `PurchaseLineItem` at the top of the file.)

- [ ] **Step 2: Update `createTicket` to serialize the array**

In `createTicket`, replace the existing block:

```ts
if (ticketData.isPurchaseRequest) {
  fields.IsPurchaseRequest = true;
  fields.PurchaseStatus = "Pending Approval";
  if (ticketData.purchaseItemUrl) fields.PurchaseItemUrl = ticketData.purchaseItemUrl;
  if (ticketData.purchaseQuantity) fields.PurchaseQuantity = ticketData.purchaseQuantity;
  if (ticketData.purchaseEstCostPerItem) fields.PurchaseEstCostPerItem = ticketData.purchaseEstCostPerItem;
  if (ticketData.purchaseJustification) fields.PurchaseJustification = ticketData.purchaseJustification;
  if (ticketData.purchaseProject) fields.PurchaseProject = ticketData.purchaseProject;
}
```

with:

```ts
if (ticketData.isPurchaseRequest) {
  fields.IsPurchaseRequest = true;
  fields.PurchaseStatus = "Pending Approval";
  if (ticketData.purchaseLineItems && ticketData.purchaseLineItems.length > 0) {
    fields.PurchaseLineItemsJSON = serializeLineItems(ticketData.purchaseLineItems);
  }
  if (ticketData.purchaseJustification) fields.PurchaseJustification = ticketData.purchaseJustification;
  if (ticketData.purchaseProject) fields.PurchaseProject = ticketData.purchaseProject;
}
```

- [ ] **Step 3: Add the import**

At the top of `src/lib/graphClient.ts`, add:

```ts
import { serializeLineItems } from "@/lib/lineItemHelpers";
import type { PurchaseLineItem } from "@/types/ticket";
```

(If `PurchaseLineItem` is already imported via the existing `Ticket` import, skip the second import.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: TypeScript may flag callers in `src/app/new/page.tsx` that still pass `purchaseItemUrl`. That's OK — we'll fix the form in Task 5–7.

If you want a clean type-check before continuing, temporarily keep the legacy fields as deprecated aliases:

```ts
// In CreateTicketData, keep these for one task as transitional:
purchaseItemUrl?: string;
purchaseQuantity?: number;
purchaseEstCostPerItem?: number;
```

And in `createTicket`, ignore them (they'll go unused but won't error). Remove them after Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graphClient.ts
git commit -m "Update createTicket to write PurchaseLineItemsJSON"
```

---

## Task 5: Build `LineItemsField` reusable editor component

**Files:**
- Create: `src/components/LineItemsField.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/LineItemsField.tsx
"use client";

import { PurchaseLineItem } from "@/types/ticket";
import { computeEstimatedTotal } from "@/lib/lineItemHelpers";

interface LineItemsFieldProps {
  items: PurchaseLineItem[];
  onChange: (items: PurchaseLineItem[]) => void;
  showOrderFields?: boolean;       // also show vendor/orderNum/actualCost/expectedDelivery (Purchaser flow)
}

const EMPTY_ROW: PurchaseLineItem = { qty: 1, cost: 0 };

export default function LineItemsField({ items, onChange, showOrderFields = false }: LineItemsFieldProps) {
  const ensureAtLeastOne = items.length === 0 ? [EMPTY_ROW] : items;
  const total = computeEstimatedTotal(ensureAtLeastOne);

  const updateRow = (index: number, patch: Partial<PurchaseLineItem>) => {
    const next = ensureAtLeastOne.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const removeRow = (index: number) => {
    if (ensureAtLeastOne.length <= 1) return; // keep at least one
    onChange(ensureAtLeastOne.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...ensureAtLeastOne, { ...EMPTY_ROW }]);
  };

  return (
    <div className="space-y-2">
      {ensureAtLeastOne.map((item, idx) => (
        <div
          key={idx}
          className="bg-white border border-amber-300 rounded p-2 flex flex-wrap items-center gap-2"
        >
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold">
            {idx + 1}
          </span>
          <input
            type="text"
            value={item.name ?? ""}
            onChange={(e) => updateRow(idx, { name: e.target.value })}
            placeholder="Item name"
            className="flex-[2_2_140px] min-w-[140px] px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <input
            type="url"
            value={item.url ?? ""}
            onChange={(e) => updateRow(idx, { url: e.target.value })}
            placeholder="https://... (optional if name given)"
            className="flex-[3_3_180px] min-w-[160px] px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <input
            type="number"
            value={item.qty}
            onChange={(e) => updateRow(idx, { qty: Math.max(1, parseInt(e.target.value || "1", 10)) })}
            min={1}
            step={1}
            className="w-16 px-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Quantity"
          />
          <div className="relative">
            <span className="absolute left-2 top-1.5 text-sm text-amber-600">$</span>
            <input
              type="number"
              value={item.cost}
              onChange={(e) => updateRow(idx, { cost: Math.max(0, parseFloat(e.target.value || "0")) })}
              min={0}
              step={0.01}
              className="w-24 pl-5 pr-2 py-1.5 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              aria-label="Cost per item"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            disabled={ensureAtLeastOne.length <= 1}
            className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={`Remove item ${idx + 1}`}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full px-3 py-2 bg-amber-200 text-amber-900 text-sm font-semibold rounded hover:bg-amber-300 transition-colors"
      >
        + Add Another Item
      </button>

      <div className="flex justify-end items-center gap-2 px-2 py-1 bg-amber-100 rounded">
        <span className="text-xs font-medium text-amber-800">Estimated Total:</span>
        <span className="text-sm font-bold text-amber-900">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LineItemsField.tsx
git commit -m "Add LineItemsField reusable multi-row editor component"
```

---

## Task 6: Wire `LineItemsField` into the new ticket form, move toggle to top, hide Description

**Files:**
- Modify: `src/app/new/page.tsx`

- [ ] **Step 1: Import the component and types**

At the top of `src/app/new/page.tsx`, add:

```tsx
import LineItemsField from "@/components/LineItemsField";
import type { PurchaseLineItem } from "@/types/ticket";
import { validateLineItem } from "@/lib/lineItemHelpers";
```

- [ ] **Step 2: Replace the existing `purchaseFields` state with line items + shared fields**

Find the existing state (around line 89):

```tsx
const [purchaseFields, setPurchaseFields] = useState({
  itemUrl: "",
  quantity: "",
  estCostPerItem: "",
  justification: "",
  project: "",
});
```

Replace with:

```tsx
const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([{ qty: 1, cost: 0 }]);
const [purchaseShared, setPurchaseShared] = useState({
  justification: "",
  project: "",
});
```

- [ ] **Step 3: Move the Purchase Request toggle above Title**

Find the form structure around line 700+. The current order is `Title → Description → Category → (Purchase toggle if Request) → ...`. New order: `Category → Purchase toggle (if Request) → Title → (Description hidden if purchase) → ...`.

Move the JSX block that contains `<input type="checkbox" checked={isPurchaseRequest}` (the toggle and its wrapper amber `<label>`) to immediately after the Category radio group, before the Title field.

- [ ] **Step 4: Conditionally hide Description**

Find the Description `<textarea>` block. Wrap it in a conditional:

```tsx
{!isPurchaseRequest && (
  <div className="space-y-1.5">
    <label htmlFor="description" /* ... existing markup ... */ />
    <textarea /* ... existing markup ... */ />
  </div>
)}
```

When `isPurchaseRequest` is true, the Description field is hidden. Component state for `formData.description` is preserved — toggling back restores the text.

- [ ] **Step 5: Replace the single-item purchase block with LineItemsField + shared fields**

Find the existing block under `{isPurchaseRequest && (` that renders Purchase Details (around line 753–847). Replace its contents with:

```tsx
{isPurchaseRequest && (
  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-4">
    <h3 className="text-sm font-medium text-amber-900">Line Items</h3>
    <LineItemsField items={lineItems} onChange={setLineItems} />

    <div>
      <label htmlFor="purchaseJustification" className="block text-xs font-medium text-amber-800 mb-1">
        Justification (shared) <span className="text-red-500">*</span>
      </label>
      <textarea
        id="purchaseJustification"
        value={purchaseShared.justification}
        onChange={(e) => setPurchaseShared((prev) => ({ ...prev, justification: e.target.value }))}
        placeholder="Why is this purchase needed?"
        rows={3}
        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
      />
    </div>

    <div>
      <label htmlFor="purchaseProject" className="block text-xs font-medium text-amber-800 mb-1">
        Project <span className="text-amber-600">(optional)</span>
      </label>
      <input
        type="text"
        id="purchaseProject"
        value={purchaseShared.project}
        onChange={(e) => setPurchaseShared((prev) => ({ ...prev, project: e.target.value }))}
        placeholder="Project name this is for"
        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
      />
    </div>
  </div>
)}
```

- [ ] **Step 6: Update form submit to use the new state**

Find the submit handler (around line 264 — search for `if (isPurchaseRequest)`). Replace the existing population of `ticketData.purchaseItemUrl` etc. with:

```tsx
if (isPurchaseRequest) {
  ticketData.isPurchaseRequest = true;
  ticketData.purchaseLineItems = lineItems;
  ticketData.purchaseJustification = purchaseShared.justification || undefined;
  ticketData.purchaseProject = purchaseShared.project || undefined;
}
```

- [ ] **Step 7: Add validation for line items at submit**

In the submit handler (just above the existing validation block), add:

```tsx
if (isPurchaseRequest) {
  if (lineItems.length === 0) {
    setError("Add at least one item to the purchase request.");
    return;
  }
  for (let i = 0; i < lineItems.length; i++) {
    const err = validateLineItem(lineItems[i]);
    if (err) {
      setError(`Item ${i + 1}: ${err}`);
      return;
    }
  }
  if (!purchaseShared.justification.trim()) {
    setError("Justification is required for purchase requests.");
    return;
  }
}
```

- [ ] **Step 8: Reset state on successful submit**

Find the existing `setIsPurchaseRequest(false)` (around line 506). Add right after it:

```tsx
setLineItems([{ qty: 1, cost: 0 }]);
setPurchaseShared({ justification: "", project: "" });
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. If errors point to leftover `purchaseFields` references, find and remove them.

- [ ] **Step 10: Manual UI verification**

```bash
npm run dev
```

Open http://localhost:3000/new. Verify:
1. Toggle "Purchase Request" checkbox appears immediately after the Category radio (not after Title).
2. When checked, Description field disappears.
3. When unchecked again, Description re-appears with previously typed text intact (component state preserved).
4. The Line Items section shows one row by default.
5. Click "+ Add Another Item" — a second row appears.
6. Click × on row 2 — it's removed. Click × on row 1 — disabled (only one row left).
7. Type values, watch the Estimated Total update live.
8. Submit with empty line items → see validation error.

- [ ] **Step 11: Commit**

```bash
git add src/app/new/page.tsx
git commit -m "Wire multi-item line items into new ticket form, move purchase toggle to top, hide Description on purchase"
```

---

## Task 7: Build `LineItemsTable` read-only display component

**Files:**
- Create: `src/components/LineItemsTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/LineItemsTable.tsx
"use client";

import { PurchaseLineItem } from "@/types/ticket";
import { computeEstimatedTotal, computeActualTotal } from "@/lib/lineItemHelpers";

interface LineItemsTableProps {
  items: PurchaseLineItem[];
  showOrderColumns?: boolean;     // vendor / orderNum / actualCost / expectedDelivery
  showReceivedColumns?: boolean;  // receivedQty / receivedDate
  compact?: boolean;              // smaller padding / fonts (for approval banner)
}

export default function LineItemsTable({
  items,
  showOrderColumns = false,
  showReceivedColumns = false,
  compact = false,
}: LineItemsTableProps) {
  if (items.length === 0) return null;

  const padding = compact ? "px-2 py-1" : "px-3 py-2";
  const fontSize = compact ? "text-xs" : "text-sm";
  const estTotal = computeEstimatedTotal(items);
  const actTotal = computeActualTotal(items);
  const hasActuals = items.some((i) => i.actualCost != null);

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${fontSize} border-collapse`}>
        <thead>
          <tr className="bg-gray-50 text-text-secondary">
            <th className={`text-left ${padding}`}>Item</th>
            <th className={`text-center ${padding}`}>Qty</th>
            <th className={`text-right ${padding}`}>$/ea</th>
            <th className={`text-right ${padding}`}>Subtotal</th>
            {showOrderColumns && (
              <>
                <th className={`text-left ${padding}`}>Vendor</th>
                <th className={`text-left ${padding}`}>Order #</th>
                <th className={`text-right ${padding}`}>Actual $/ea</th>
                <th className={`text-left ${padding}`}>Delivery</th>
              </>
            )}
            {showReceivedColumns && (
              <>
                <th className={`text-center ${padding}`}>Received</th>
                <th className={`text-left ${padding}`}>On</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-t border-border">
              <td className={padding}>
                {item.name ? <strong>{item.name}</strong> : null}
                {item.name && item.url ? <span className="text-text-secondary"> · </span> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                    link
                  </a>
                ) : null}
              </td>
              <td className={`text-center ${padding}`}>{item.qty}</td>
              <td className={`text-right ${padding}`}>${item.cost.toFixed(2)}</td>
              <td className={`text-right ${padding}`}>${(item.qty * item.cost).toFixed(2)}</td>
              {showOrderColumns && (
                <>
                  <td className={padding}>{item.vendor ?? "—"}</td>
                  <td className={padding}>{item.orderNum ?? "—"}</td>
                  <td className={`text-right ${padding}`}>{item.actualCost != null ? `$${item.actualCost.toFixed(2)}` : "—"}</td>
                  <td className={padding}>{item.expectedDelivery ?? "—"}</td>
                </>
              )}
              {showReceivedColumns && (
                <>
                  <td className={`text-center ${padding}`}>
                    {item.receivedQty != null ? `${item.receivedQty} / ${item.qty}` : "—"}
                  </td>
                  <td className={padding}>{item.receivedDate ?? "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td colSpan={3} className={`text-right ${padding}`}>Estimated Total</td>
            <td className={`text-right ${padding}`}>${estTotal.toFixed(2)}</td>
            {showOrderColumns && <td colSpan={4} />}
            {showReceivedColumns && <td colSpan={2} />}
          </tr>
          {hasActuals && (
            <tr className="border-t border-border font-semibold">
              <td colSpan={3} className={`text-right ${padding}`}>Actual Total</td>
              <td className={`text-right ${padding}`}>${actTotal.toFixed(2)}</td>
              {showOrderColumns && <td colSpan={4} />}
              {showReceivedColumns && <td colSpan={2} />}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/LineItemsTable.tsx
git commit -m "Add LineItemsTable read-only display component"
```

---

## Task 8: Update `DetailsPanel` to render `LineItemsTable` for purchase tickets

**Files:**
- Modify: `src/components/DetailsPanel.tsx`

- [ ] **Step 1: Import the component**

At the top of `DetailsPanel.tsx`, add:

```tsx
import LineItemsTable from "./LineItemsTable";
```

- [ ] **Step 2: Replace the existing single-item rendering**

Find the existing block around line 781-870 that renders Purchase Details (the section with `ticket.isPurchaseRequest && ticket.purchaseStatus &&`). Replace the body that lists item URL, quantity, est cost, after-purchase fields, etc. with a single component:

```tsx
{ticket.isPurchaseRequest && ticket.purchaseStatus && (
  <div className="border-t border-border pt-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-medium text-text-primary">Purchase Details</h3>
      <PurchaseStatusBadge status={ticket.purchaseStatus as PurchaseStatus} size="sm" />
    </div>

    {ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
      <LineItemsTable
        items={ticket.purchaseLineItems}
        showOrderColumns={ticket.purchaseLineItems.some((i) => i.vendor || i.orderNum)}
        showReceivedColumns={ticket.purchaseLineItems.some((i) => i.receivedDate)}
      />
    )}

    {ticket.purchaseJustification && (
      <div className="mt-3">
        <p className="text-xs text-text-secondary uppercase">Justification</p>
        <p className="text-sm whitespace-pre-wrap">{ticket.purchaseJustification}</p>
      </div>
    )}

    {ticket.purchaseProject && (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-text-secondary uppercase">Project</span>
        <span className="text-sm">{ticket.purchaseProject}</span>
      </div>
    )}
  </div>
)}
```

(Keep the `PurchaseActionPanel` and `ReceiveActionPanel` rendering below this block — those are still wired for Purchaser/Inventory write actions. Tasks 12–13 update them.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual UI verification**

```bash
npm run dev
```

Open an existing legacy single-item purchase ticket. Verify:
1. The right sidebar Purchase Details section now shows a one-row table (synthesized from legacy columns by `mapToTicket`).
2. Justification + Project still display below the table.
3. The status badge still shows.

- [ ] **Step 5: Commit**

```bash
git add src/components/DetailsPanel.tsx
git commit -m "Render LineItemsTable in DetailsPanel for purchase tickets"
```

---

## Task 9: Move `ApprovalActionPanel` from sidebar to main page area

**Files:**
- Modify: `src/components/DetailsPanel.tsx` — remove ApprovalActionPanel from here
- Modify: `src/components/TicketDetail.tsx` — render ApprovalActionPanel above the conversation thread

- [ ] **Step 1: Find where `ApprovalActionPanel` is currently rendered in DetailsPanel**

Search `src/components/DetailsPanel.tsx` for `ApprovalActionPanel`. There should be a JSX block that conditionally renders it (something like `{ticket.approvalStatus === "Pending" && canApprove() && (<ApprovalActionPanel ... />)}`). Note its props.

- [ ] **Step 2: Remove the block from DetailsPanel**

Delete that JSX block. Also remove the `ApprovalActionPanel` import if no longer used.

- [ ] **Step 3: Find a good insertion point in `TicketDetail.tsx`**

Open `src/components/TicketDetail.tsx`. Find the JSX block where the ticket header / conversation begins (search for `<ConversationThread` or `comments.map`). The approval banner should render directly above it, only when `approvalStatus === "Pending"` and the current user can approve.

- [ ] **Step 4: Render the banner in TicketDetail**

Add an import:

```tsx
import ApprovalActionPanel from "./ApprovalActionPanel";
```

(If already imported lower for prop drilling, fine — make sure it's at module scope.)

Add the banner JSX above the conversation:

```tsx
{ticket.approvalStatus === "Pending" && canApprove() && (
  <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
    <ApprovalActionPanel
      ticket={ticket}
      isPurchaseRequest={ticket.isPurchaseRequest || false}
      onDecision={handleApprovalDecision}
    />
  </div>
)}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. If `canApprove` isn't already imported/destructured in TicketDetail, pull it from `useRBAC()` (line ~28 area).

- [ ] **Step 6: Manual UI verification**

```bash
npm run dev
```

1. Open a Pending Approval ticket as an admin user. The 4-button approval row should appear at the top of the main column, above the conversation. The right sidebar Purchase Details section should NOT have the approval buttons anymore.
2. Open a non-pending ticket — no banner appears.
3. Open a pending ticket as a non-admin — no banner appears.

- [ ] **Step 7: Commit**

```bash
git add src/components/DetailsPanel.tsx src/components/TicketDetail.tsx
git commit -m "Move ApprovalActionPanel from sidebar to main page banner"
```

---

## Task 10: Add inline item summary table + button hierarchy to `ApprovalActionPanel`

**Files:**
- Modify: `src/components/ApprovalActionPanel.tsx`

- [ ] **Step 1: Import LineItemsTable and helpers**

```tsx
import LineItemsTable from "./LineItemsTable";
import { computeEstimatedTotal } from "@/lib/lineItemHelpers";
```

- [ ] **Step 2: Render the item summary table at the top when purchase request**

Find the `return` block (line ~97). Right after the existing `<h4>` header div, add a conditional block:

```tsx
{isPurchaseRequest && ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
  <div className="border border-border rounded-lg bg-bg-subtle p-3">
    <div className="text-xs font-semibold text-text-secondary mb-2">
      Reviewing {ticket.purchaseLineItems.length} item{ticket.purchaseLineItems.length === 1 ? "" : "s"}
    </div>
    <LineItemsTable items={ticket.purchaseLineItems} compact />
  </div>
)}
```

- [ ] **Step 3: Replace the 4-button grid with primary CTA + secondary chips**

Find the block that starts `/* Purchase request: 4-button layout */` (line ~152). Replace the entire `<div className="grid grid-cols-2 gap-1.5">...</div>` and its contents with:

```tsx
<div className="space-y-2">
  <button
    onClick={() => handleActionSelect("Approved")}
    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    {ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0
      ? `Approve All ($${computeEstimatedTotal(ticket.purchaseLineItems).toFixed(0)})`
      : "Approve"}
  </button>
  <div className="grid grid-cols-3 gap-1.5">
    <button
      onClick={() => handleActionSelect("Approved with Changes")}
      className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
    >
      w/ Changes
    </button>
    <button
      onClick={() => handleActionSelect("Approved & Ordered")}
      className="px-2 py-1.5 bg-white border border-blue-500 text-blue-600 text-xs rounded font-medium hover:bg-blue-50 transition-colors"
    >
      + Order
    </button>
    <button
      onClick={() => handleActionSelect("Denied")}
      className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
    >
      Deny
    </button>
  </div>
</div>
```

- [ ] **Step 4: Apply similar hierarchy to the standard 3-button block**

Find the `/* Standard request: 3-button layout */` block. Replace with:

```tsx
<div className="space-y-2">
  <button
    onClick={() => handleActionSelect("Approved")}
    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    Approve
  </button>
  <div className="grid grid-cols-2 gap-1.5">
    <button
      onClick={() => handleActionSelect("Changes Requested")}
      className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
    >
      Changes
    </button>
    <button
      onClick={() => handleActionSelect("Denied")}
      className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
    >
      Deny
    </button>
  </div>
</div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual UI verification**

```bash
npm run dev
```

1. Open a Pending Approval purchase ticket — see the item summary table inline above the buttons. "Approve All ($X)" is the big green CTA. Other 3 are smaller outlined chips.
2. Open a non-purchase Pending ticket — see "Approve" as primary, "Changes" + "Deny" smaller below.

- [ ] **Step 7: Commit**

```bash
git add src/components/ApprovalActionPanel.tsx
git commit -m "Add inline item summary and primary-CTA button hierarchy in ApprovalActionPanel"
```

---

## Task 11: Add helper `updateTicketLineItems` in `graphClient.ts` with verification

**Files:**
- Modify: `src/lib/graphClient.ts`

- [ ] **Step 1: Add a helper function**

Add near `updatePurchaseFields` (around line 524):

```ts
// Update the line items JSON column with verification.
// Optionally also writes purchaseStatus in the same PATCH (e.g. flipping to "Ordered").
export async function updateTicketLineItems(
  client: Client,
  ticketId: string,
  lineItems: PurchaseLineItem[],
  options?: { purchaseStatus?: string; notes?: string },
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;
  const json = serializeLineItems(lineItems);

  const fields: Record<string, unknown> = { PurchaseLineItemsJSON: json };
  if (options?.purchaseStatus) fields.PurchaseStatus = options.purchaseStatus;
  if (options?.notes) fields.PurchaseNotes = options.notes;

  await client.api(endpoint).patch({ fields });

  // Verify
  const verifyResponse = await client.api(`${endpoint}?$expand=fields`).get();
  const verifiedJson = (verifyResponse.fields as Record<string, unknown>).PurchaseLineItemsJSON as string | undefined;
  if (verifiedJson !== json) {
    throw new Error("Line items failed to save to SharePoint. Please retry.");
  }

  invalidateTicketsCache();
  return mapToTicket(verifyResponse);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/graphClient.ts
git commit -m "Add updateTicketLineItems helper with PATCH verification"
```

---

## Task 12: Implement "Approve with Changes" item-removal helper

**Files:**
- Modify: `src/components/ApprovalActionPanel.tsx`
- Modify: `src/components/TicketDetail.tsx` (to thread the new line-items mutation through)
- Modify: `src/lib/activityLog.ts` (or wherever event types are defined — search for `purchase_ordered`)

- [ ] **Step 1: Add `purchase_items_changed` event type**

Find where activity log event types are defined. Add `"purchase_items_changed"` to the union type. (Search for `"purchase_ordered" |` to find the type union.)

- [ ] **Step 2: Extend `onDecision` callback signature**

In `ApprovalActionPanel.tsx`, change the `onDecision` prop signature to optionally accept a `keptItems` array:

```ts
onDecision: (
  decision: ApprovalDecision,
  notes?: string,
  options?: { keptItems?: PurchaseLineItem[] },
) => Promise<void>;
```

(Import `PurchaseLineItem` at the top.)

- [ ] **Step 3: Add state for the item checklist**

Inside the component, add state for which items are toggled-on:

```tsx
const [keptItemIndexes, setKeptItemIndexes] = useState<Set<number>>(
  new Set(ticket.purchaseLineItems?.map((_, i) => i) ?? []),
);
```

- [ ] **Step 4: Render the checklist when `selectedAction === "Approved with Changes"` and the ticket has line items**

In the existing expanded notes block (search for `{selectedAction ? (`), add the checklist before the notes textarea, conditional on Approved with Changes:

```tsx
{selectedAction === "Approved with Changes" && isPurchaseRequest && ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
  <div className="bg-white border border-orange-200 rounded p-2 space-y-1">
    <p className="text-xs text-orange-800">Untick items to remove from the approval. Notes auto-fill below.</p>
    {ticket.purchaseLineItems.map((item, idx) => {
      const kept = keptItemIndexes.has(idx);
      return (
        <label
          key={idx}
          className={`flex justify-between items-center text-sm ${kept ? "" : "line-through text-text-secondary"}`}
        >
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={kept}
              onChange={() => {
                const next = new Set(keptItemIndexes);
                if (kept) next.delete(idx); else next.add(idx);
                setKeptItemIndexes(next);
                // auto-fill notes
                const removed = ticket.purchaseLineItems!.filter((_, i) => !next.has(i));
                const kept2 = ticket.purchaseLineItems!.filter((_, i) => next.has(i));
                const removedSummary = removed.length
                  ? `Removed from order: ${removed.map((r) => `${r.name || r.url || "item"} (×${r.qty})`).join(", ")}.`
                  : "";
                const total = kept2.reduce((s, r) => s + r.qty * r.cost, 0);
                setNotes(`${removedSummary} Approved remaining ${kept2.length} item${kept2.length === 1 ? "" : "s"}, total $${total.toFixed(2)}.`.trim());
              }}
            />
            {item.name || item.url || `Item ${idx + 1}`} × {item.qty}
          </span>
          <span>${(item.qty * item.cost).toFixed(2)}</span>
        </label>
      );
    })}
  </div>
)}
```

- [ ] **Step 5: Pass `keptItems` to `onDecision` on confirm**

In `handleConfirm`, when the action is "Approved with Changes" with line items, pass the kept items:

```tsx
const keptItems =
  selectedAction === "Approved with Changes" && ticket.purchaseLineItems
    ? ticket.purchaseLineItems.filter((_, i) => keptItemIndexes.has(i))
    : undefined;
await onDecision(selectedAction, notes.trim() || undefined, { keptItems });
```

- [ ] **Step 6: Update `handleApprovalDecision` in `TicketDetail.tsx`**

Update the signature to accept `options.keptItems`. After `processApprovalDecision` succeeds, if `keptItems` was passed, also call `updateTicketLineItems`:

```tsx
const handleApprovalDecision = async (
  decision: "Approved" | "Denied" | "Changes Requested" | "Approved with Changes" | "Approved & Ordered",
  notes?: string,
  options?: { keptItems?: PurchaseLineItem[] },
) => {
  // ... existing code through the processApprovalDecision call ...

  // If GM removed items via the checklist, rewrite line items now
  if (options?.keptItems && options.keptItems.length > 0) {
    const further = await updateTicketLineItems(client, ticket.id, options.keptItems);
    onUpdate(further);
    logActivity(client, {
      eventType: "purchase_items_changed",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: approverEmail,
      actorName: approverName,
      description: `Items modified during approval by ${approverName}`,
      details: JSON.stringify({
        removed: (ticket.purchaseLineItems ?? []).filter((it) => !options.keptItems!.includes(it)),
        kept: options.keptItems,
      }),
    }).catch((e) => console.error("Failed to log items change:", e));
  }
  // ... continue with existing comment + email notifications ...
};
```

Add imports at top:

```tsx
import { updateTicketLineItems } from "@/lib/graphClient";
import type { PurchaseLineItem } from "@/types/ticket";
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Manual UI verification**

```bash
npm run dev
```

1. Open a multi-item pending purchase ticket as admin.
2. Click "w/ Changes". The item checklist appears with all items checked.
3. Untick one item — it strikes through, total recalculates, notes auto-fill with "Removed from order: X (×N)..."
4. Click Confirm. The ticket should now show fewer items (the kept ones), the new total reflects the change, and an activity log entry shows up.

- [ ] **Step 9: Commit**

```bash
git add src/components/ApprovalActionPanel.tsx src/components/TicketDetail.tsx src/lib/activityLog.ts
git commit -m "Add Approve with Changes item-removal helper with auto-filled notes"
```

---

## Task 13: Implement "Approve & Order" per-item table with "Same as above"

**Files:**
- Modify: `src/components/ApprovalActionPanel.tsx`
- Modify: `src/components/TicketDetail.tsx`
- Modify: `src/lib/graphClient.ts` (add a helper to call from TicketDetail)

- [ ] **Step 1: Add state for per-item order data in `ApprovalActionPanel`**

```tsx
const [orderItems, setOrderItems] = useState<PurchaseLineItem[]>(
  ticket.purchaseLineItems ?? [],
);
const [sameAsAbove, setSameAsAbove] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Render the per-item order table when `selectedAction === "Approved & Ordered"`**

Inside the expanded notes block (next to where Approve with Changes shows the checklist), add:

```tsx
{selectedAction === "Approved & Ordered" && isPurchaseRequest && orderItems.length > 0 && (
  <div className="space-y-2">
    <p className="text-xs text-blue-800">Fill order details per item. Tick "Same as above" to copy vendor + order # from the previous row.</p>
    {orderItems.map((item, idx) => {
      const sameOn = sameAsAbove.has(idx);
      const aboveItem = idx > 0 ? orderItems[idx - 1] : null;
      const vendor = sameOn && aboveItem ? aboveItem.vendor ?? "" : item.vendor ?? "";
      const orderNum = sameOn && aboveItem ? aboveItem.orderNum ?? "" : item.orderNum ?? "";
      return (
        <div key={idx} className="bg-white border border-blue-200 rounded p-2 space-y-1">
          <div className="flex justify-between items-center text-sm">
            <strong>{idx + 1}. {item.name || item.url || `Item ${idx + 1}`} × {item.qty} — est ${(item.qty * item.cost).toFixed(2)}</strong>
            {idx > 0 && (
              <label className="text-xs text-blue-700 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={sameOn}
                  onChange={() => {
                    const next = new Set(sameAsAbove);
                    if (sameOn) next.delete(idx); else next.add(idx);
                    setSameAsAbove(next);
                    // when toggling on, copy vendor+orderNum from above into local state
                    if (!sameOn && aboveItem) {
                      const updated = [...orderItems];
                      updated[idx] = { ...updated[idx], vendor: aboveItem.vendor, orderNum: aboveItem.orderNum };
                      setOrderItems(updated);
                    }
                  }}
                />
                Same vendor + order # as above
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <input
              type="text"
              placeholder="Vendor"
              value={vendor}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], vendor: e.target.value };
                setOrderItems(updated);
              }}
              disabled={sameOn}
              className="px-2 py-1 border border-border rounded text-sm disabled:opacity-55"
            />
            <input
              type="text"
              placeholder="Order #"
              value={orderNum}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], orderNum: e.target.value };
                setOrderItems(updated);
              }}
              disabled={sameOn}
              className="px-2 py-1 border border-border rounded text-sm disabled:opacity-55"
            />
            <input
              type="number"
              placeholder={`Actual $/ea (est $${item.cost.toFixed(2)})`}
              value={item.actualCost ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], actualCost: e.target.value === "" ? undefined : parseFloat(e.target.value) };
                setOrderItems(updated);
              }}
              step={0.01}
              min={0}
              className="px-2 py-1 border border-border rounded text-sm"
            />
            <input
              type="date"
              value={item.expectedDelivery ?? ""}
              onChange={(e) => {
                const updated = [...orderItems];
                updated[idx] = { ...updated[idx], expectedDelivery: e.target.value };
                setOrderItems(updated);
              }}
              className="px-2 py-1 border border-border rounded text-sm"
            />
          </div>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: Update confirm button label for "+ Order"**

Find the Confirm button. When the action is "Approved & Ordered", show item + vendor count:

```tsx
{selectedAction === "Approved & Ordered" ? (
  <>Confirm Approve & Order ({orderItems.length} item{orderItems.length === 1 ? "" : "s"}, {distinctVendorCount(orderItems)} vendor{distinctVendorCount(orderItems) === 1 ? "" : "s"})</>
) : (
  <>{isLoading ? "Processing..." : `Confirm ${selectedAction}`}</>
)}
```

(Import `distinctVendorCount` from `@/lib/lineItemHelpers`.)

- [ ] **Step 4: Resolve "Same as above" before confirming**

Before passing `orderItems` to the parent, materialize the copied vendor + order #:

```tsx
const finalOrderItems = orderItems.map((item, i) => {
  if (i === 0 || !sameAsAbove.has(i)) return item;
  return {
    ...item,
    vendor: orderItems[i - 1].vendor,
    orderNum: orderItems[i - 1].orderNum,
  };
});
```

Pass `finalOrderItems` in the options object to `onDecision`:

```tsx
await onDecision(selectedAction, notes.trim() || undefined, {
  orderItems: selectedAction === "Approved & Ordered" ? finalOrderItems : undefined,
  keptItems: selectedAction === "Approved with Changes" ? keptItems : undefined,
});
```

(Update the `onDecision` signature again to include `orderItems`.)

- [ ] **Step 5: Update `handleApprovalDecision` in TicketDetail.tsx**

After `processApprovalDecision`, if `options.orderItems` was passed, write them and flip status:

```tsx
import { allItemsOrdered } from "@/lib/lineItemHelpers";

// ... inside handleApprovalDecision after processApprovalDecision succeeds:
if (options?.orderItems) {
  const newStatus = allItemsOrdered(options.orderItems) ? "Ordered" : "Approved";
  const further = await updateTicketLineItems(client, ticket.id, options.orderItems, {
    purchaseStatus: newStatus,
  });
  onUpdate(further);
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Manual UI verification**

```bash
npm run dev
```

1. Open a multi-item pending purchase ticket as admin.
2. Click "+ Order". Per-item table appears with all rows.
3. Type vendor "Amazon" in row 1, order # "123-XYZ".
4. On row 2, tick "Same vendor + order # as above". Row 2's vendor + order# auto-fill, fields disabled.
5. On row 3, leave unticked, type vendor "B&H", order # "W-456".
6. Confirm. The ticket's PurchaseStatus should flip to "Ordered" since every row has vendor + orderNum. The Purchase Details panel now shows per-item vendor + order # in the table.

- [ ] **Step 8: Commit**

```bash
git add src/components/ApprovalActionPanel.tsx src/components/TicketDetail.tsx src/lib/graphClient.ts
git commit -m "Add Approve & Order per-item table with Same as above shortcut"
```

---

## Task 14: Update `PurchaseActionPanel` to write per-item data

**Files:**
- Modify: `src/components/PurchaseActionPanel.tsx`

- [ ] **Step 1: Read current state of PurchaseActionPanel**

Open the file. Note the existing form fields (vendor, confirmation #, actual cost, expected delivery) — they currently write to single columns via `updatePurchaseFields`.

- [ ] **Step 2: Replace single fields with per-item table**

Replace the form body with a per-item table similar to the GM "Approve & Order" expanded view (Task 13 step 2), pre-seeded from `ticket.purchaseLineItems`. Skip the "Same as above" complexity for this panel — the items already exist; just have one editable row per item.

- [ ] **Step 3: On confirm, save via `updateTicketLineItems`**

```tsx
import { updateTicketLineItems } from "@/lib/graphClient";
import { allItemsOrdered } from "@/lib/lineItemHelpers";

// inside the confirm handler, replace the existing updatePurchaseFields call:
const newStatus = allItemsOrdered(orderItems) ? "Ordered" : (ticket.purchaseStatus ?? "Approved");
const updated = await updateTicketLineItems(client, ticket.id, orderItems, { purchaseStatus: newStatus });
onUpdate(updated);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual UI verification**

```bash
npm run dev
```

1. Find an Approved (but not yet Ordered) multi-item purchase ticket.
2. As a Purchaser role user, the PurchaseActionPanel appears in the right sidebar (or wherever it currently renders). Open it.
3. The per-item table appears with all line items pre-seeded.
4. Fill in vendor + order # for each item, save.
5. Verify the status flipped to "Ordered" and DetailsPanel shows per-item vendor/order#.

- [ ] **Step 6: Commit**

```bash
git add src/components/PurchaseActionPanel.tsx
git commit -m "Update PurchaseActionPanel to write per-item order data"
```

---

## Task 15: Update `ReceiveActionPanel` for per-item receipts

**Files:**
- Modify: `src/components/ReceiveActionPanel.tsx`

- [ ] **Step 1: Replace single received-date / notes block with per-item rows**

Per-item table where each row has:
- Item label (name or url, qty)
- "Received Qty" input (default to `item.qty`)
- "Received Date" input
- "Mark all received today" button at the top to bulk-fill

- [ ] **Step 2: On confirm, save via `updateTicketLineItems` and flip status**

```tsx
import { allItemsReceived } from "@/lib/lineItemHelpers";

const newStatus = allItemsReceived(receivedItems) ? "Received" : ticket.purchaseStatus ?? "Ordered";
const updated = await updateTicketLineItems(client, ticket.id, receivedItems, { purchaseStatus: newStatus });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual UI verification**

```bash
npm run dev
```

1. Find an Ordered multi-item ticket.
2. As Inventory user, open ReceiveActionPanel.
3. Per-item rows appear. Mark some as received with received qty + date. Confirm.
4. Status stays at "Ordered" since not all received. Mark the rest. Status flips to "Received".

- [ ] **Step 5: Commit**

```bash
git add src/components/ReceiveActionPanel.tsx
git commit -m "Update ReceiveActionPanel to write per-item receipt data"
```

---

## Task 16: Remove transitional legacy fields from `CreateTicketData` (cleanup)

**Files:**
- Modify: `src/lib/graphClient.ts`

- [ ] **Step 1: Remove the deprecated aliases added in Task 4**

If you kept `purchaseItemUrl`, `purchaseQuantity`, `purchaseEstCostPerItem` as transitional aliases in `CreateTicketData` for compile-clean intermediate steps, delete them now. Confirm no remaining callers reference them.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/graphClient.ts
git commit -m "Remove deprecated single-item purchase fields from CreateTicketData"
```

---

## Task 17: Update help documentation

**Files:**
- Modify: `src/app/help/page.tsx`

- [ ] **Step 1: Find the Purchase Request help section**

Search for `Purchase Request` in `src/app/help/page.tsx`.

- [ ] **Step 2: Update the section text and structure**

Update the Purchase Request section to cover:
1. The Purchase Request toggle is at the top of the new ticket form (right after Category).
2. Multi-item: click "+ Add Another Item" to add line items to a single request.
3. Each line item needs a name OR URL, plus qty and est cost.
4. Justification and Project are shared across all items.
5. GM approval flow is in the main page area (no longer in the right sidebar).
6. GM can use "Approve with Changes" to remove items before approving.
7. GM can use "+ Order" to capture per-item vendor + order # in one step.

Keep the existing structure and tone. Use bullet points + numbered steps where the existing help page uses them.

- [ ] **Step 3: Manual UI verification**

```bash
npm run dev
```

Visit /help, scroll to Purchase Request section, confirm the new content reads cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/help/page.tsx
git commit -m "Update help docs for multi-item purchase requests"
```

---

## Task 18: Final end-to-end UI sweep

**Files:** none (verification only)

- [ ] **Step 1: Run dev server and walk through full lifecycle**

```bash
npm run dev
```

End-to-end smoke test:
1. **Create a 3-item purchase request** as a regular user. Verify form layout (toggle on top, no Description, multi-item rows, justification + project).
2. **Sign in as GM admin.** Open the new ticket. The approval banner appears at the top of the main column with the item summary table and primary "Approve All ($X)" CTA.
3. **Click "w/ Changes"**, untick one item, confirm. Verify: ticket retains 2 items, total recalculates, activity log shows `purchase_items_changed`, notes saved.
4. **Wait — actually approve a different ticket via "+ Order"** with mixed vendors and "Same as above" on one row. Verify status flips to Ordered, DetailsPanel shows per-item vendor/order#.
5. **Sign in as Purchaser** (or use a ticket that's at "Approved" status). Open PurchaseActionPanel, fill per-item data, save. Verify status flips correctly.
6. **Sign in as Inventory.** Open ReceiveActionPanel for an Ordered ticket. Mark items received, confirm partial → Ordered status, mark the rest → Received status.
7. **Open an old single-item legacy purchase ticket.** Confirm DetailsPanel renders it as a one-row table. Approval still works the same way.
8. **Open the Help page.** Scroll to Purchase Request section. Verify updated text.

- [ ] **Step 2: Type-check one final time**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build production bundle**

Run: `npm run build`
Expected: build succeeds with no TypeScript or lint errors.

- [ ] **Step 4: Commit any documentation/spec follow-up if discovered, then push**

If everything verifies green:

```bash
git push origin main
```

---

## Self-Review Notes

**Spec coverage check:** Every section of the spec has at least one task implementing it:
- Data model + dual-read → Task 2
- Form changes (toggle position, hide Description, multi-item) → Tasks 5, 6
- Approval UI moved to main area → Task 9
- GM approval UI improvements (item table, button hierarchy) → Task 10
- Approve with Changes item-removal → Task 12
- Approve & Order per-item with "Same as above" → Task 13
- DetailsPanel per-item display → Task 8
- Purchaser flow per-item → Task 14
- Inventory flow per-item → Task 15
- Activity log new event → Task 12 step 1
- Help docs → Task 17
- Backwards compat → covered by `mapToTicket` in Task 2 and verified in Task 8 step 4 + Task 18 step 1.7

**Type consistency check:** `PurchaseLineItem` field names (`url`, `name`, `qty`, `cost`, `vendor`, `orderNum`, `actualCost`, `expectedDelivery`, `receivedDate`, `receivedQty`) used consistently across spec and all tasks. `updateTicketLineItems` signature matches between definition (Task 11) and callers (Tasks 12, 13, 14, 15).

**Placeholder scan:** Every step contains the actual code or command. No "implement later" or "similar to". The standard 3-button block in Task 10 step 4 repeats the markup from step 3 rather than referencing it.
