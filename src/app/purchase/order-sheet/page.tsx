"use client";

import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import OrderSheetGrid from "@/modules/purchase/components/OrderSheetGrid";

export default function OrderSheetPage() {
  return (
    <PurchasePageShell>
      <OrderSheetGrid />
    </PurchasePageShell>
  );
}
