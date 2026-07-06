"use client";

// "Re-send approval request" — shown on the purchase/CDW detail pages while the
// item is pending approval, so a swallowed/failed approver email isn't a dead end.
// The caller supplies the actual send (the module's trigger*ApprovalRequest helper,
// which returns whether the POST succeeded). After a successful send the button
// stays disabled for a short cooldown so it can't be used to spam the GM group.

import { useEffect, useRef, useState } from "react";

const COOLDOWN_MS = 30_000;

type SendState = "idle" | "sending" | "sent" | "failed";

export default function ResendApprovalButton({ onSend }: { onSend: () => Promise<boolean> }) {
  const [state, setState] = useState<SendState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function handleClick() {
    setState("sending");
    const ok = await onSend().catch((e) => {
      console.error("[ResendApprovalButton] send failed:", e);
      return false;
    });
    setState(ok ? "sent" : "failed");
    if (ok) {
      timer.current = setTimeout(() => setState("idle"), COOLDOWN_MS);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "sending" || state === "sent"}
        className="px-3 py-1.5 bg-bg-card text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Re-send approval request"}
      </button>
      {state === "sent" && <span className="text-sm text-green-700">Approval request sent.</span>}
      {state === "failed" && (
        <span className="text-sm text-red-600">Could not send the approval email. Try again in a moment.</span>
      )}
    </div>
  );
}
