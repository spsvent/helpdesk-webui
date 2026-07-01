"use client";

import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import PurchaseForm from "@/modules/purchase/components/PurchaseForm";

export default function NewPurchasePage() {
  return (
    <PurchasePageShell>
      <PurchaseForm />
    </PurchasePageShell>
  );
}
