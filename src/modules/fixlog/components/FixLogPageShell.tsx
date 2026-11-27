"use client";

import { ReactNode } from "react";
import ModulePageShell from "@/components/ModulePageShell";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRBAC } from "@/contexts/RBACContext";
import { canUseFixLog } from "../access";
import { isFixLogConfigured } from "../fixLogService";

// Shared shell + the IT-only gate. The nav entry is already hidden from everyone
// else (manifest visibleWhen); this covers a typed or shared /fixlog URL.
function Gate({ children }: { children: ReactNode }) {
  const { permissions, loading } = useRBAC();
  if (loading) return <LoadingSpinner />;
  if (!isFixLogConfigured())
    return <p className="text-center text-text-secondary">The Quick Fix Log isn&apos;t set up yet.</p>;
  if (!canUseFixLog(permissions))
    return <p className="text-center text-text-secondary">The Quick Fix Log is for the IT team.</p>;
  return <>{children}</>;
}

export default function FixLogPageShell({ children }: { children: ReactNode }) {
  return (
    <ModulePageShell signInNoun="the Quick Fix Log">
      <Gate>{children}</Gate>
    </ModulePageShell>
  );
}
