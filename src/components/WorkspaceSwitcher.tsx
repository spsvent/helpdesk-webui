"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRBAC } from "@/contexts/RBACContext";
import { workspaceModules } from "@/shared/formModules";

// Top-level workspace switcher (the "C" model): swaps the whole app view between
// each request type's list+detail — Tickets · Purchase · CDW · (future). Built
// entirely from the FORM_MODULES manifest, so adding a new request type adds a chip
// automatically. Cross-type concerns (Approvals, Awaiting Order/Receipt) stay as the
// shared aggregation layer in the header. Hides itself when only one workspace exists.
export default function WorkspaceSwitcher() {
  const { permissions } = useRBAC();
  const pathname = usePathname() || "/";
  const mods = workspaceModules(permissions);
  if (mods.length <= 1) return null;

  // Ticket workspace ("/") only matches the exact home path (the "/?ticket=" detail
  // keeps pathname "/"); module workspaces match their prefix ("/cdw", "/cdw/new").
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Workspace"
      className="inline-flex items-center rounded-lg border border-border bg-bg-subtle p-0.5 text-sm"
    >
      {mods.map((m) => {
        const active = isActive(m.workspaceHref!);
        return (
          <Link
            key={m.id}
            href={m.workspaceHref!}
            aria-current={active ? "page" : undefined}
            className={`px-2.5 sm:px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
              active
                ? "bg-bg-card text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {m.workspaceLabel}
          </Link>
        );
      })}
    </nav>
  );
}
