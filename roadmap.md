# Project Roadmap

## High Priority
- [ ] **Extract Purchase Requests into their own form module** — _2026-07-01_
  Pull the purchase-request workflow out of the ticket Request flow into a self-contained form
  module — its own SharePoint list, route, components, and approval — mirroring the CDW module and
  the `FORM_MODULES` manifest (`src/shared/formModules.ts`, `src/modules/cdw/`). Adds a third "+ New"
  option: **New Ticket / New CDW / New Purchase Request**. Decouples the ~17 purchase columns and the
  `isPurchaseRequest` branches (~65 refs across 17 files) + `mapToTicket` from the Tickets list, so
  purchases become cleanly removable/evolvable like CDW. **Large migration — plan needed:** data
  migration for existing purchase-request tickets, the `/orders` + `/receiving` queues, the
  GM/Purchaser/Inventory fan-out + email approval, and the purchase badges/filters that currently
  live in the shared ticket list.
- [x] **Refresh button at top of page** — _2026-05-06_ — done in feature/refresh-button
  A refresh button on top of the page to hard refresh and bring in new ticket updates.

## Normal Priority
- [x] **Multi-item purchase requests** — _2026-04-28_ — done in PRs #3 and #6
  When a request is marked as a purchase request, add a button to add additional products to the same request, and hide/remove some of the normal request fields. Plan needed.
- [ ] **Integrate preexisting SharePoint purchase request system** — _2026-05-06_
  Integrate the preexisting purchase request SharePoint systems with our new Help Desk integrated purchase request system. Ask user for more details when ready to start.

## Low Priority
- [ ] **Per-item approval state** — _2026-04-28_
  Allow GM to approve/deny line items individually instead of all-or-nothing. Today "Approve with Changes" rewrites the bundle; per-item state would let mixed Pending/Approved/Denied coexist on a ticket.
- [ ] **Purchase request status workflow polish** — _2026-04-28_
  Refine the multi-stage Pending → Approved → Ordered → Received transitions, badges, and rules. Skipped during the multi-item finetune iteration.
- [ ] **"Partially Ordered" / "Partially Received" status values** — _2026-04-28_
  Status currently flips only when *all* items have the relevant data. Add intermediate states so the dashboard can surface tickets where some items are in flight.
- [ ] **Auto-scrape product info for inventory team** — _2026-05-06_
  When items are purchased/ordered, automatically look at the page it was purchased from to gather info for the inventory team — and even pull manuals and warranty info. Each vendor will be different but we could start small. Some may have an API we can use for that kind of stuff.
- [ ] **Snipe-IT integration for received assets** — _2026-05-08_
  Items marked as received are loaded into Snipe-IT. Explore further connections possible with Snipe-IT to better track assets purchased.
