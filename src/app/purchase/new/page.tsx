"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PurchasePageShell from "@/modules/purchase/components/PurchasePageShell";
import PurchaseForm from "@/modules/purchase/components/PurchaseForm";
import LoadingSpinner from "@/components/LoadingSpinner";

function NewPurchaseInner() {
  const fromTicket = useSearchParams().get("fromTicket");
  return <PurchaseForm fromTicketId={fromTicket || undefined} />;
}

export default function NewPurchasePage() {
  return (
    <PurchasePageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <NewPurchaseInner />
      </Suspense>
    </PurchasePageShell>
  );
}
