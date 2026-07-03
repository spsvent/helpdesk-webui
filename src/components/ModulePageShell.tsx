"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useIsAuthenticated } from "@azure/msal-react";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";

// Minimal auth gate + page container for a form module's authenticated routes
// (/cdw, /purchase, …). The app layout provides the MSAL/RBAC/Theme providers;
// this just ensures a signed-in user, shows the home-link header, and gives a
// consistent padded container (mirrors how /orders and /receiving render their
// own chrome under the shared layout). Modules wrap it with their own noun
// (see CdwPageShell / PurchasePageShell) — modules importing core components
// is the allowed dependency direction; core never imports from modules.
export default function ModulePageShell({
  signInNoun,
  children,
}: {
  // Names the content in the sign-in prompt, e.g. "creative briefs".
  signInNoun: string;
  children: ReactNode;
}) {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-text-secondary">Please sign in to view {signInNoun}.</p>
          <Link href="/" className="mt-3 inline-block text-brand-primary underline">
            Go to the Help Desk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-bg-card px-4 sm:px-8 py-2 safe-area-inset flex items-center gap-3 flex-wrap">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="hidden sm:inline">SkyPark Help Desk</span>
        </Link>
        <WorkspaceSwitcher />
      </div>
      <div className="p-4 sm:p-8">{children}</div>
    </div>
  );
}
