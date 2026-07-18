"use client";

// The approver's decision note (the "ApprovalNotes" column), surfaced wherever a
// purchaser acts on an approved request so the GM's ordering instructions travel
// with the work. Ticket #479: purchasers (Kim) couldn't see approver notes from
// the order form — the note only rendered in the approval-summary box up top,
// which scrolls off-screen above the line items + order panel.
export default function ApproverNote({
  note,
  by,
  className = "",
}: {
  note?: string;
  by?: string;
  className?: string;
}) {
  if (!note?.trim()) return null;
  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
        Note from approver{by ? ` · ${by}` : ""}
      </p>
      <p className="mt-1 text-sm text-amber-900 whitespace-pre-wrap">{note}</p>
    </div>
  );
}
