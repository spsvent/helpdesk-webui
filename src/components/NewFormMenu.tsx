"use client";

import { useEffect, useRef, useState } from "react";
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
 * plain link. With more than one it becomes a dropdown — each row a module with its
 * label + one-line description. Keyboard support: ArrowDown opens/moves, ArrowUp
 * moves, Escape closes and restores focus to the trigger, Enter activates natively.
 */
export default function NewFormMenu({ permissions }: NewFormMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modules = creatableModules(permissions);

  // Move focus into the menu when it opens so arrow keys work immediately.
  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = idx === -1
        ? (delta === 1 ? 0 : items.length - 1)
        : (idx + delta + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (e.key === "Tab") {
      // Let focus move on naturally, but don't leave a stranded open menu.
      setOpen(false);
    }
  };

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
    <div className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
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
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={menuRef}
            role="menu"
            className="absolute left-0 top-[calc(100%+6px)] z-20 w-72 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden py-1"
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
        </>
      )}
    </div>
  );
}
