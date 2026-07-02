"use client";

import TokenApprovalPage from "@/components/TokenApprovalPage";

// Public, token-authorized landing for the CDW email approval links — thin
// config over the shared TokenApprovalPage. Auth is skipped for this path in
// layout.tsx (via the manifest); the token authorizes the action.
const ACTION_URL = process.env.NEXT_PUBLIC_CDW_APPROVAL_ACTION_URL || "";

type Brief = {
  title: string;
  deadline: string | null;
  projectManager: string | null;
  quickTake: string | null;
  currentStatus: string;
  decidedBy: string | null;
  decidedDate: string | null;
};

export default function CdwApprovePage() {
  return (
    <TokenApprovalPage<Brief>
      actionUrl={ACTION_URL}
      entityNoun="creative brief"
      shortNoun="brief"
      homeHref="/cdw"
      getEntity={(data) => data.brief as Brief}
      renderDetails={(brief) => (
        <>
          {brief.quickTake && (
            <p className="mt-3 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Quick take:</span> {brief.quickTake}
            </p>
          )}
          {brief.deadline && (
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Deadline:</span> {brief.deadline}
            </p>
          )}
        </>
      )}
      changesPlaceholder="e.g. Please tighten the call to action"
    />
  );
}
