"use client";

import { ReactNode } from "react";
import ModulePageShell from "@/components/ModulePageShell";

// Thin module wrapper over the shared shell — keeps the purchase noun in one place.
export default function PurchasePageShell({ children }: { children: ReactNode }) {
  return <ModulePageShell signInNoun="purchase requests">{children}</ModulePageShell>;
}
