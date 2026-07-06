"use client";

import TokenApprovalPage from "@/components/TokenApprovalPage";

// Public, token-authorized landing for purchase email approval links — thin
// config over the shared TokenApprovalPage. Auth is skipped for this path in
// layout.tsx (via the manifest); the token authorizes the action.
const ACTION_URL = process.env.NEXT_PUBLIC_PURCHASE_APPROVAL_ACTION_URL || "";

type Request = {
  title: string;
  justification: string | null;
  project: string | null;
  currentStatus: string;
  decidedBy: string | null;
  decidedDate: string | null;
};

export default function PurchaseApprovePage() {
  return (
    <TokenApprovalPage<Request>
      actionUrl={ACTION_URL}
      entityNoun="purchase request"
      shortNoun="request"
      homeHref="/purchase"
      getEntity={(data) => data.request as Request}
      renderDetails={(request) =>
        request.justification && (
          <p className="mt-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">Justification:</span> {request.justification}
          </p>
        )
      }
      changesPlaceholder="e.g. Please find a cheaper vendor"
    />
  );
}
