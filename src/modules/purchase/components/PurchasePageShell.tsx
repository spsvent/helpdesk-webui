"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useIsAuthenticated } from "@azure/msal-react";

// Auth gate + page container for the authenticated purchase routes (mirrors CdwPageShell).
export default function PurchasePageShell({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-text-secondary">Please sign in to view purchase requests.</p>
          <Link href="/" className="mt-3 inline-block text-brand-primary underline">Go to the Help Desk</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-bg-card px-4 sm:px-8 py-2 safe-area-inset">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          SkyPark Help Desk
        </Link>
      </div>
      <div className="p-4 sm:p-8">{children}</div>
    </div>
  );
}
