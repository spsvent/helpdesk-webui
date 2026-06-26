"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CdwPageShell from "@/modules/cdw/components/CdwPageShell";
import CdwForm from "@/modules/cdw/components/CdwForm";
import LoadingSpinner from "@/components/LoadingSpinner";

function EditInner() {
  const id = useSearchParams().get("id");
  return <CdwForm briefId={id || undefined} />;
}

export default function EditCdwPage() {
  return (
    <CdwPageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <EditInner />
      </Suspense>
    </CdwPageShell>
  );
}
