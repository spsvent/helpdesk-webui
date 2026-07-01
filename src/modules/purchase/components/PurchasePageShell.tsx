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
  return <div className="min-h-screen p-4 sm:p-8">{children}</div>;
}
