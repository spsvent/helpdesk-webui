"use client";

import Link from "next/link";
import { useRBAC } from "@/contexts/RBACContext";
import { canCreatePurchase } from "../access";

// Additive bridge on the ticket detail: turn a regular Request/Problem ticket into a
// purchase request. Self-contained (lives in the module) so it's removed with it.
// The parent decides when to render it (non-purchase tickets); this just gates on
// create permission and links to the pre-filled purchase form.
export default function ConvertToPurchaseButton({ ticketId }: { ticketId: string }) {
  const { permissions } = useRBAC();
  if (!canCreatePurchase(permissions)) return null;
  return (
    <Link
      href={`/purchase/new?fromTicket=${ticketId}`}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg font-medium hover:bg-amber-700 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
      Convert to Purchase Request
    </Link>
  );
}
