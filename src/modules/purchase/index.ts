// Purchase form-module manifest entry — the only thing the app shell imports from
// this module. Plain data (component references are lazy `import()` thunks, never
// eval-time imports). Mirrors the CDW module.
//
// To remove the purchase module: delete src/modules/purchase/ + src/app/purchase/,
// the purchase Azure Functions, this entry in src/shared/formModules.ts, the
// standalone-flow content in the "purchase-requests" help section in
// src/app/help/page.tsx (the "Option 1 — Standalone Purchase Request" block and the
// Editing/Cancelling subsections), and the NEXT_PUBLIC_PURCHASE_* env vars; archive
// the PurchaseRequests list.
// Nothing else in core references this module — the ticket-detail "Convert to
// Purchase Request" button and the Settings "Purchase Migration" tab are
// contributed through this manifest (ticketDetailActions / settingsTabs), not
// hard-imported by core.

import type { FormModule } from "@/shared/formModules";
import { canCreatePurchase } from "./access";
import { isPurchaseConfigured } from "./purchaseService";

export const purchaseModule: FormModule = {
  id: "purchase",
  label: "Purchase Request",
  newLabel: "New purchase request",
  newDescription: "Request to buy equipment, supplies, or services",
  welcomeTile: {
    description: "Request to buy equipment, supplies, or services — routed for approval.",
    accent: "var(--color-brand-accent)",
  },
  creatable: true,
  newHref: "/purchase/new",
  // Hidden until the PurchaseRequests list is configured
  // (NEXT_PUBLIC_PURCHASE_LIST_ID); then any signed-in user can create.
  visibleWhen: (perms) => isPurchaseConfigured() && canCreatePurchase(perms),
  publicRoutePrefixes: ["/purchase/approve"],
  workspaceHref: "/purchase",
  workspaceLabel: "Purchase",
  workspaceOrder: 10,
  settingsTabs: [
    {
      id: "purchase-migration",
      label: "Purchase Migration",
      // Copy-only ticket→PurchaseRequests migration runner (moved here from the
      // purchase list page). Same gate it had there: admin + module configured.
      load: () => import("./components/MigrationPanel"),
      visibleWhen: (perms) => perms?.role === "admin" && isPurchaseConfigured(),
    },
  ],
  ticketDetailActions: [
    {
      id: "convert-to-purchase",
      // The component itself additionally gates on purchase-create permission.
      load: () => import("./components/ConvertToPurchaseButton"),
      visibleWhen: (ticket) => ticket.status !== "Closed",
    },
  ],
};
