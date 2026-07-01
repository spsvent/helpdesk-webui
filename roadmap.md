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
- [ ] **HEIC image preview support (or convert to JPG)** — _2026-07-01_
  Browsers can't decode HEIC/HEIF (the default iPhone photo format — the most common attachment on
  field tickets) or TIFF, so the attachment thumbnails + lightbox fall back to a download-only tile
  for these (see `isBrowserPreviewable` in `src/lib/attachmentComments.ts`, `AttachmentThumbnail.tsx`,
  `ImageLightbox.tsx`). Make these previewable, in rough order of preference:
  1. **Backend conversion to JPG on upload** — generate a web-viewable `.jpg` rendition (and/or a
     small thumbnail) server-side when a HEIC/HEIF/TIFF is attached (e.g. an Azure Function using
     `libheif`/`sharp`/ImageMagick), store it alongside the original, and point the preview at the
     rendition while keeping the untouched original for download. Cleanest UX; needs server compute
     + storage and a place to hang the conversion (the SPA is a static export, so this is a Function).
  2. **Client-side decode** — render previews in-browser with a library such as `heic2any` /
     `libheif-js` (WASM). No backend, but adds bundle weight and can be slow/janky on large photos;
     evaluate perf before committing.
  3. **Fallback if neither is feasible — warn at upload time.** In `AttachmentUpload.tsx` (and the
     staged-file flow in `src/app/new/page.tsx` / `StagedAttachmentList.tsx`), detect `.heic`/`.heif`
     on selection and show a non-blocking flag: "HEIC images can't be previewed in the browser —
     convert to JPG first if you want an inline preview." Still allow the upload; this is purely an
     expectation-setting nudge. Cheap; ship this regardless if 1 or 2 slips.

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
