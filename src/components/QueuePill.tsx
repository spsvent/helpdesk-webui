"use client";

interface QueuePillProps {
  label: string;
  count: number;
  /** Highlighted (currently applied as the list view). */
  active?: boolean;
  onClick?: () => void;
  title?: string;
}

/**
 * A role-gated work-queue pill for the header (Approvals / Needs ordering / Needs
 * receiving). Label + a round count badge — brand-filled when the queue has items,
 * gray when empty. The active state (brand tint) marks the queue currently applied
 * as the ticket-list view.
 */
export default function QueuePill({ label, count, active = false, onClick, title }: QueuePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold border whitespace-nowrap transition-colors ${
        active
          ? "border-brand-primary text-brand-primary bg-brand-primary/10"
          : "border-border text-text-primary bg-bg-card hover:bg-brand-primary/[0.06]"
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold ${
          count > 0 ? "bg-brand-primary text-white" : "bg-border text-text-secondary"
        }`}
      >
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}
