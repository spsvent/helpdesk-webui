# Project Roadmap

## Normal Priority
- [ ] **Multi-item purchase requests** — _2026-04-28_
  When a request is marked as a purchase request, add a button to add additional products to the same request, and hide/remove some of the normal request fields. Plan needed.

## Low Priority
- [ ] **Per-item approval state** — _2026-04-28_
  Allow GM to approve/deny line items individually instead of all-or-nothing. Today "Approve with Changes" rewrites the bundle; per-item state would let mixed Pending/Approved/Denied coexist on a ticket.
- [ ] **Purchase request status workflow polish** — _2026-04-28_
  Refine the multi-stage Pending → Approved → Ordered → Received transitions, badges, and rules. Skipped during the multi-item finetune iteration.
- [ ] **"Partially Ordered" / "Partially Received" status values** — _2026-04-28_
  Status currently flips only when *all* items have the relevant data. Add intermediate states so the dashboard can surface tickets where some items are in flight.
