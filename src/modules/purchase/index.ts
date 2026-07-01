// Purchase form-module manifest entry — the only thing the app shell imports from
// this module. Plain data (component references are lazy `import()` thunks, never
// eval-time imports). Mirrors the CDW module.
//
// To remove the purchase module: delete src/modules/purchase/ + src/app/purchase/,
// the purchase Azure Functions, this entry in src/shared/formModules.ts, the help
// section, and the NEXT_PUBLIC_PURCHASE_* env vars; archive the PurchaseRequests list.
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
  newLabel: "New Purchase Request",
  creatable: true,
  newHref: "/purchase/new",
  visibleWhen: canCreatePurchase,
  publicRoutePrefixes: ["/purchase/approve"],
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
      visibleWhen: (ticket) => !ticket.isPurchaseRequest && ticket.status !== "Closed",
    },
  ],
};
