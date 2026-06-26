"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useIsAuthenticated } from "@azure/msal-react";

// Minimal auth gate + page container for the authenticated CDW routes. The app
// layout provides the MSAL/RBAC/Theme providers; this just ensures a signed-in
// user and a consistent padded container (mirrors how /orders, /receiving render
// their own chrome under the shared layout).
export default function CdwPageShell({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-text-secondary">Please sign in to view creative briefs.</p>
          <Link href="/" className="mt-3 inline-block text-brand-primary underline">
            Go to the Help Desk
          </Link>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen p-4 sm:p-8">{children}</div>;
}
