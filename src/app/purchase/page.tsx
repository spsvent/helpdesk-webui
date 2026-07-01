"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import PurchaseList from "@/modules/purchase/components/PurchaseList";
import PurchaseDetail from "@/modules/purchase/components/PurchaseDetail";
import LoadingSpinner from "@/components/LoadingSpinner";

function PurchaseIndexInner() {
  const id = useSearchParams().get("id");
  return id ? <PurchaseDetail id={id} /> : <PurchaseList />;
}

export default function PurchaseIndexPage() {
  return (
    <PurchasePageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <PurchaseIndexInner />
      </Suspense>
    </PurchasePageShell>
  );
}
