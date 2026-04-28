# Purchase Request Finetune — Design Spec

**Date:** 2026-04-28
**Author:** Justin (with Claude)
**Status:** Approved, ready for implementation plan

## Problem

The current Purchase Request workflow assumes one item per ticket. Real purchases at SkyPark routinely involve multiple line items, often from different vendors. Today users either submit multiple tickets (clutters the queue, fragments approval) or stuff multiple items into a single Description field (loses structure, breaks per-item ordering and receipt tracking).

The new-ticket form also asks for several fields that are irrelevant for purchases (notably Description, which duplicates per-item URLs and the shared Justification). The GM approval UI is buried in a 280px sidebar with no item context, making approval-with-changes and approve-and-order awkward in real use.

## Goals

1. **Multi-item line items per purchase request ticket** with an "Add Another Item" button.
2. **Hide irrelevant fields** when Purchase Request is checked, and **promote the toggle to the top** of the form so the form reshapes before users type.
3. **Polish the GM approval UI** — surface line items + totals inline, give Approve a clearer primary CTA, add per-item vendor/order# capture on "Approve & Order", and add a structured item-removal helper for "Approve with Changes".
4. **Move the approval flow out of the right sidebar into the main column** so the per-item tables fit comfortably.

## Non-Goals (deferred to roadmap)

- Per-item approval state (mixed Pending/Approved/Denied per ticket).
- Status workflow polish ("Partially Ordered" / "Partially Received" intermediate states).
- Email-based purchase auto-update (already on roadmap).

## Approach

**Storage:** A single new multi-line text column `PurchaseLineItemsJSON` on the existing Tickets list. Stores the array of line items as JSON. Legacy single-item columns (`PurchaseItemUrl`, `PurchaseQuantity`, `PurchaseEstCostPerItem`, `PurchaseVendor`, `PurchaseConfirmationNum`, `PurchaseActualCost`, `PurchasedDate`, `PurchaseExpectedDelivery`) become read-only fallbacks for tickets created before this change.

**Why JSON over a separate `PurchaseLineItems` list:** All-or-nothing approval means the whole bundle is always read together; per-item querying isn't required at the SharePoint level (the webapp filters tickets in memory anyway via `getAllTicketsCached`). JSON keeps the deployment footprint to one new column and zero migration. Old tickets keep working untouched via dual-read in `mapToTicket`.

## Data Model

```ts
// types/ticket.ts
export interface PurchaseLineItem {
  // Entered by requester
  url?: string;            // optional — sometimes there's no link
  name?: string;            // free-text item name (new); either name OR url required
  qty: number;
  cost: number;             // estimated $/item

  // Entered by GM on "Approve & Order", or by Purchaser later
  vendor?: string;
  orderNum?: string;
  actualCost?: number;      // actual $/item if it differs from estimated
  expectedDelivery?: string; // ISO date

  // Entered by Inventory on receipt
  receivedDate?: string;    // ISO date
  receivedQty?: number;     // supports partial receipts
}

export interface Ticket {
  // ...existing fields...
  purchaseLineItems?: PurchaseLineItem[];   // canonical (new)

  // legacy fields stay for backwards-compat reads only
  purchaseItemUrl?: string;
  purchaseQuantity?: number;
  purchaseEstCostPerItem?: number;
  purchaseVendor?: string;
  purchaseConfirmationNum?: string;
  purchaseActualCost?: number;
  purchasedDate?: string;
  purchaseExpectedDelivery?: string;
}
```

**`mapToTicket` read logic:**
1. If `PurchaseLineItemsJSON` is non-empty → parse into `purchaseLineItems`.
2. Else if any of the legacy item columns has a value → synthesize a single-item array from `{PurchaseItemUrl, PurchaseQuantity, PurchaseEstCostPerItem}` (and merge in `{PurchaseVendor, PurchaseConfirmationNum, PurchaseActualCost, PurchasedDate, PurchaseExpectedDelivery}` if present).
3. Else `purchaseLineItems = undefined`.

**Write logic:**
- New tickets and any update that mutates items: serialize to `PurchaseLineItemsJSON`. Leave legacy columns null.
- Old tickets: untouched until an update writes the JSON column, at which point it becomes the canonical source.

**Status flip rules (unchanged from today, applied per-item):**
- `PurchaseStatus = "Ordered"` only when every item has both `vendor` and `orderNum`.
- `PurchaseStatus = "Received"` only when every item has `receivedDate` and `receivedQty >= qty`.
- Mixed states stay at the previous status (no new "Partially X" states this iteration).

## Form Changes (`src/app/new/page.tsx`)

**Field order for purchase requests:**
1. Category radio (Request / Problem) — unchanged
2. **Purchase Request toggle** — moved to immediately follow Category, before Title (so the form reshapes before any typing)
3. Title — unchanged
4. *Description hidden when Purchase is checked* — keep typed text in component state so untoggling restores it
5. Department / Sub-categories — unchanged
6. Line Items panel (when Purchase is checked):
   - One row per item: `name`, `url`, `qty`, `$/ea`, Remove (×) button
   - "+ Add Another Item" button below the rows
   - Live "Estimated Total" row at the bottom
   - Shared Justification (textarea, required)
   - Shared Project (text, optional)
7. Priority, Location, Due Date — unchanged

**Validation:**
- At least one of `name` or `url` is required per row (both is fine).
- `qty >= 1` and `cost >= 0` per row.
- At least one row required to submit.
- Remove (×) button disabled when only one row remains.

**State preservation on toggle:**
When the user types Description and then ticks Purchase, keep their text in `useState` rather than clearing it — so untoggling restores it. (No need to persist across page reloads.)

## Approval UI — Layout Change

**All approval UIs move from the right sidebar to a banner at the top of the main column** (above the conversation thread) whenever `approvalStatus === "Pending"` AND the current user can approve. This applies to both purchase and standard (non-purchase) approvals, for consistency.

The right sidebar `DetailsPanel` keeps a **read-only** Purchase Details summary for context, but no longer holds the action buttons or expanded approval forms.

Mobile already uses single-column layout, so the banner stacks naturally above the conversation. No special mobile work.

## GM Approval UI (`src/components/ApprovalActionPanel.tsx`)

**Header:** approval status pill + summary (`"3 items · $660"` for purchase, just status for standard).

**Item summary table** (purchase only): inline above the buttons. Columns: Item (name or url), Qty, $/ea, Subtotal. Total row at the bottom. Single-item legacy purchase tickets get the same table with one row.

**Button hierarchy:**
- **Primary:** large green "Approve All ($X)" full-width CTA — total embedded in the label.
- **Secondary:** smaller outlined chips below (`w/ Changes`, `+ Order`, `Deny`).
- Standard non-purchase tickets: smaller "Approve" + outlined "Deny" + outlined "Changes Requested".

**"Approve with Changes" expanded form:**
- Item checklist — each row has a checkbox (default checked). Unticking marks the item for removal; the row becomes struck-through and de-emphasized.
- Total recalculates live based on kept items.
- Notes textarea pre-fills with `"Removed from order: X (×N), Y (×M). Approved remaining N items, total $T."` when items are unticked. Fully editable.
- Confirm action **mutates the line items** to the kept items only and saves the notes. The activity log records `purchase_items_changed { removed, kept }`.

**"Approve & Order" expanded form (purchase only):**
- Per-item table: Vendor, Order #, Actual $/ea, Expected Delivery, "Same as above" checkbox.
- "Same as above" copies **only** vendor + order # from the previous row (the things that genuinely repeat). Actual cost and delivery date stay independent. Disabled fields display at 55% opacity.
- Optional ticket-level Notes textarea below.
- Confirm button label includes item + vendor counts: `"Confirm Approve & Order (3 items, 2 vendors)"`.
- On confirm: PATCH writes the per-item data into `PurchaseLineItemsJSON`, sets `PurchaseStatus = "Ordered"` if every item has vendor + orderNum; otherwise leaves it at "Approved".

## DetailsPanel (`src/components/DetailsPanel.tsx`) — read-only display

Renders the line-item table:
- Pre-approval: name/url, qty, cost, subtotal per row + total.
- Once ordered: each row also shows vendor + order # + actual cost + expected delivery.
- Once received: each row also shows received qty / qty + date with a checkmark.
- Old single-item legacy tickets render identically — `mapToTicket` synthesizes a one-row array.

## Purchaser & Inventory flows (scope ripple)

**`PurchaseActionPanel`** (Purchaser): replace the single vendor/order#/cost block with a per-item table identical to GM "Approve & Order" (minus "Same as above" — items already exist when this panel runs, so the assist is less useful, but we can include it if it's cheap). On save, writes per-item data into `PurchaseLineItemsJSON`.

**`ReceiveActionPanel`** (Inventory): per-item received-quantity + received-date inputs. On save, writes per-item `receivedDate` and `receivedQty` into the JSON. Status flips to "Received" only when all items satisfy the receipt rule.

## Activity Log

- **New event type** `purchase_items_changed` — emitted when "Approve with Changes" removes items. Payload: `{ removed: PurchaseLineItem[], kept: PurchaseLineItem[] }`.
- **Existing `purchase_ordered`** event extended to include per-item vendor/order#/cost data instead of single values.
- **Existing `purchase_received`** event extended likewise.

## Help Documentation

Per `CLAUDE.md`, update `src/app/help/page.tsx` Purchase Request section to document:
- Multi-item behavior and "Add Another Item" button
- Toggle moved to top of the form
- Approval flow now in the main page area
- "Same as above" shortcut on Approve & Order

## Error Handling / Verification

Each PATCH that mutates the JSON column follows the existing verification pattern in `processApprovalDecision`:
1. PATCH the field.
2. Re-fetch the ticket.
3. Throw an error if the parsed-back JSON doesn't match what was sent.
4. Display inline error in the action panel.

This guards against the silent-save failure mode that bit us before (commit `b24a9cd`).

## Backwards Compatibility

- Existing single-item purchase tickets render correctly via legacy fallback in `mapToTicket`.
- Existing single-item tickets continue to display in `DetailsPanel` and approval UIs without code paths for "is this old or new" — the synthesized array makes both paths identical.
- The first time a Purchaser/Inventory user updates a legacy ticket, the update converts it to the new format on save.
- No migration script needed.

## Open Questions

None remaining. All clarifying questions resolved during brainstorm.

## Out of Scope (added to roadmap)

- Per-item approval state (low priority)
- Status workflow polish — "Partially Ordered" / "Partially Received" (low priority)
- Email-based purchase auto-update (already on roadmap)
