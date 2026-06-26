"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CdwPageShell from "@/modules/cdw/components/CdwPageShell";
import CdwList from "@/modules/cdw/components/CdwList";
import CdwDetail from "@/modules/cdw/components/CdwDetail";
import LoadingSpinner from "@/components/LoadingSpinner";

// Static export can't pre-render arbitrary dynamic segments, so (like the ticket
// app's "/?ticket=") a single brief is shown via "/cdw?id=<id>".
function CdwIndexInner() {
  const id = useSearchParams().get("id");
  return id ? <CdwDetail id={id} /> : <CdwList />;
}

export default function CdwIndexPage() {
  return (
    <CdwPageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <CdwIndexInner />
      </Suspense>
    </CdwPageShell>
  );
}
