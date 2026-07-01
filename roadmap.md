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
- [x] **HEIC image preview support (backend JPG conversion)** — _2026-07-01_ — done in feature/heic-preview-support
  Browsers (except Safari/iOS) can't decode HEIC/HEIF (the default iPhone photo format — the most
  common attachment on field tickets), so the attachment thumbnails + lightbox previously fell back
  to a download-only tile. **Implemented option 1 (backend conversion):** a stateless Azure Function
  `convertHeic` (in `helpdesk-notify-func`, using `heic-convert`) takes raw HEIC bytes and returns
  JPEG bytes. The SPA sends the HEIC, stores the JPEG back on the ticket as a hidden sibling
  attachment (`<name>.HEIC.jpg`), and previews that. Conversion happens lazily the first time a HEIC
  is opened in the lightbox; the rendition is cached so thumbnails/reopens are instant. Gated on
  `NEXT_PUBLIC_HEIC_CONVERT_URL` — HEIC degrades to the download-only tile when unset. See
  `src/lib/heicRenditions.ts`, `src/lib/heicConvertService.ts`, `azure-functions/src/functions/convertHeic.js`.
  Follow-ups considered but not done: (a) **native-first** — Safari/iOS can render HEIC directly, so
  those users could skip the conversion round-trip entirely; (b) **client-side decode** (`heic-to`
  WASM) to avoid the backend; (c) a **batch backfill** of pre-existing HEIC attachments (today they
  convert lazily on first view). TIFF is still download-only.

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
