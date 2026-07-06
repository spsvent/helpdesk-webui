"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { creatableModules } from "@/shared/formModules";
import type { UserPermissions } from "@/types/rbac";

interface NewFormMenuProps {
  permissions: UserPermissions | null;
}

const TRIGGER_CLASS =
  "inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors touch-manipulation";

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * The header "+ New" entry point, driven by the form-module manifest.
 *
 * With a single creatable module (the default, ticket-only state) this renders a
 * plain link. With more than one (e.g. once the CDW/purchase modules are present) it
 * becomes a small dropdown — each row a module with its label + one-line description.
 * The app shell stays free of per-type branching.
 */
export default function NewFormMenu({ permissions }: NewFormMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const modules = creatableModules(permissions);

  // Close on outside mousedown (matches the other popovers in the app shell).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Behavior-preserving: one module → a plain link, identical to the old "+ New".
  if (modules.length <= 1) {
    const only = modules[0];
    return (
      <Link href={only?.newHref ?? "/new"} className={TRIGGER_CLASS}>
        <PlusIcon />
        New
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={TRIGGER_CLASS}
      >
        <PlusIcon />
        New
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden py-1"
        >
          {modules.map((m) => (
            <Link
              key={m.id}
              href={m.newHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 hover:bg-brand-primary/[0.08] transition-colors"
            >
              <span className="block text-sm font-bold text-text-primary">
                {m.newLabel ?? `New ${m.label}`}
              </span>
              {m.newDescription && (
                <span className="block text-[12.5px] text-text-secondary mt-0.5">
                  {m.newDescription}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
