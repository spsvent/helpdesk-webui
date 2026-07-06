"use client";

import Link from "next/link";
import { creatableModules } from "@/shared/formModules";
import type { UserPermissions } from "@/types/rbac";

interface WelcomePanelProps {
  userName?: string;
  permissions: UserPermissions | null;
}

interface Tile {
  title: string;
  description: string;
  accent: string;
  href: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string): string {
  if (!name) return "there";
  // Names may arrive as "Last, First" (Entra) or "First Last".
  const trimmed = name.trim();
  if (trimmed.includes(",")) return trimmed.split(",")[1]?.trim().split(/\s+/)[0] || trimmed;
  return trimmed.split(/\s+/)[0];
}

/**
 * The deliberately unintimidating home shown in the main pane when no ticket is
 * selected. A time-of-day greeting plus data-driven "start here" tiles: the two
 * ticket categories, then one tile per creatable form module that opts in with a
 * `welcomeTile` (see src/shared/formModules.ts). Adding a module reflows the grid.
 */
export default function WelcomePanel({ userName, permissions }: WelcomePanelProps) {
  const moduleTiles: Tile[] = creatableModules(permissions)
    .filter((m) => m.welcomeTile)
    .map((m) => ({
      title: m.newLabel ?? `New ${m.label}`,
      description: m.welcomeTile!.description,
      accent: m.welcomeTile!.accent,
      href: m.newHref,
    }));

  const tiles: Tile[] = [
    {
      title: "Report a problem",
      description: "Something's broken or not working the way it should.",
      accent: "var(--color-brand-primary)",
      href: "/new?category=Problem",
    },
    {
      title: "Make a request",
      description: "Need something new, changed, or set up.",
      accent: "var(--color-brand-secondary)",
      href: "/new?category=Request",
    },
    ...moduleTiles,
  ];

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-8">
      <div className="w-full max-w-[720px]">
        <div className="text-center mb-7">
          <h1 className="font-display text-3xl font-semibold text-text-primary mb-2">
            {greeting()}, {firstName(userName)}
          </h1>
          <p className="text-base text-text-secondary leading-relaxed">
            Pick a ticket from the list to pick up where you left off, or start something new.
          </p>
        </div>

        <div
          className="grid gap-[14px] items-stretch"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {tiles.map((tile) => (
            <Link
              key={tile.title}
              href={tile.href}
              className="group relative block h-full overflow-hidden rounded-[14px] border-[1.5px] border-border bg-bg-card py-[18px] pl-[22px] pr-5 transition-all duration-150 hover:border-brand-primary hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: tile.accent }}
                aria-hidden="true"
              />
              <span className="flex items-center gap-2 mb-1">
                <span className="font-display text-[17px] font-semibold text-text-primary">
                  {tile.title}
                </span>
                <span className="inline-flex text-base leading-none text-text-secondary transition-all duration-150 group-hover:translate-x-[3px] group-hover:text-brand-primary">
                  →
                </span>
              </span>
              <span className="block text-[13.5px] text-text-secondary leading-[1.45]">
                {tile.description}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
