// Purchase form-module manifest entry — the only thing the app shell imports from
// this module. Plain data (no component imports at eval time). Mirrors the CDW module.
//
// To remove the purchase module: delete src/modules/purchase/ + src/app/purchase/,
// the purchase Azure Functions, this entry in src/shared/formModules.ts, the help
// section, and the NEXT_PUBLIC_PURCHASE_* env vars; archive the PurchaseRequests list.

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
};
