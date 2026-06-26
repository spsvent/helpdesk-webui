"use client";

import { useState } from "react";
import Link from "next/link";
import { creatableModules } from "@/shared/formModules";
import type { UserPermissions } from "@/types/rbac";

interface NewFormMenuProps {
  permissions: UserPermissions | null;
}

const TRIGGER_CLASS =
  "px-3 sm:px-4 py-1.5 sm:py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors touch-manipulation";

/**
 * The header "+ New" entry point, driven by the form-module manifest.
 *
 * With a single creatable module (the default, ticket-only state) this renders the
 * exact same single link as before. With more than one (e.g. once the CDW module is
 * present) it becomes a small dropdown. The app shell stays free of per-type branching.
 */
export default function NewFormMenu({ permissions }: NewFormMenuProps) {
  const [open, setOpen] = useState(false);
  const modules = creatableModules(permissions);

  // Behavior-preserving: one module → a plain link, identical to the old "+ New".
  if (modules.length <= 1) {
    const only = modules[0];
    return (
      <Link href={only?.newHref ?? "/new"} className={TRIGGER_CLASS}>
        + New
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={TRIGGER_CLASS}
      >
        + New
      </button>
      {open && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute left-0 mt-1 z-20 min-w-[12rem] bg-bg-card border border-border rounded-lg shadow-lg py-1"
          >
            {modules.map((m) => (
              <Link
                key={m.id}
                href={m.newHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-primary/10 transition-colors"
              >
                {m.newLabel ?? `New ${m.label}`}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
