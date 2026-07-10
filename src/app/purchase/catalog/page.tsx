"use client";

import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import CatalogAdmin from "@/modules/purchase/components/CatalogAdmin";

export default function CatalogAdminPage() {
  return (
    <PurchasePageShell>
      <CatalogAdmin />
    </PurchasePageShell>
  );
}
