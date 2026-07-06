"use client";

import { ReactNode } from "react";
import ModulePageShell from "@/components/ModulePageShell";

// Thin module wrapper over the shared shell — keeps the CDW noun in one place.
export default function CdwPageShell({ children }: { children: ReactNode }) {
  return <ModulePageShell signInNoun="creative briefs">{children}</ModulePageShell>;
}
