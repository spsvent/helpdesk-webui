"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import FixLogPageShell from "@/modules/fixlog/components/FixLogPageShell";
import FixLogHome from "@/modules/fixlog/components/FixLogHome";
import FixLogDetail from "@/modules/fixlog/components/FixLogDetail";
import FixLogIssuesAdmin from "@/modules/fixlog/components/FixLogIssuesAdmin";
import LoadingSpinner from "@/components/LoadingSpinner";

// Static export can't pre-render dynamic segments, so (like "/?ticket=" and
// "/cdw?id=") views are query-string driven:
//   /fixlog              quick form + recent fixes
//   /fixlog?id=<id>      one entry
//   /fixlog?view=issues  edit the common-issue buttons
function FixLogInner() {
  const params = useSearchParams();
  const id = params.get("id");
  if (id) return <FixLogDetail key={id} id={id} />;
  if (params.get("view") === "issues") return <FixLogIssuesAdmin />;
  return <FixLogHome />;
}

export default function FixLogPage() {
  return (
    <FixLogPageShell>
      <Suspense fallback={<div className="p-8"><LoadingSpinner /></div>}>
        <FixLogInner />
      </Suspense>
    </FixLogPageShell>
  );
}
