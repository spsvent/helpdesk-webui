// Purchase form-module manifest entry — the only thing the app shell imports from
// this module. Plain data (component references are lazy `import()` thunks, never
// eval-time imports). Mirrors the CDW module.
//
// To remove the purchase module: delete src/modules/purchase/ + src/app/purchase/,
// the purchase Azure Functions, this entry in src/shared/formModules.ts, the help
// section, and the NEXT_PUBLIC_PURCHASE_* env vars; archive the PurchaseRequests list.
// Nothing else in core references this module — the ticket-detail "Convert to
// Purchase Request" button is contributed through this manifest
// (ticketDetailActions), not hard-imported by core.

import type { FormModule } from "@/shared/formModules";
import { canCreatePurchase } from "./access";

export const purchaseModule: FormModule = {
  id: "purchase",
  label: "Purchase Request",
  newLabel: "New Purchase Request",
  creatable: true,
  newHref: "/purchase/new",
  visibleWhen: canCreatePurchase,
  publicRoutePrefixes: ["/purchase/approve"],
  ticketDetailActions: [
    {
      id: "convert-to-purchase",
      // The component itself additionally gates on purchase-create permission.
      load: () => import("./components/ConvertToPurchaseButton"),
      visibleWhen: (ticket) => !ticket.isPurchaseRequest && ticket.status !== "Closed",
    },
  ],
};
