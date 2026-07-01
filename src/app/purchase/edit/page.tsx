"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import PurchaseForm from "@/modules/purchase/components/PurchaseForm";
import LoadingSpinner from "@/components/LoadingSpinner";

function EditInner() {
  const id = useSearchParams().get("id");
  return <PurchaseForm purchaseId={id || undefined} />;
}

export default function EditPurchasePage() {
  return (
    <PurchasePageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <EditInner />
      </Suspense>
    </PurchasePageShell>
  );
}
