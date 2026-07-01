// Form-module manifest — the single growth point the app shell reads.
//
// A "form module" is a self-contained kind of thing a user can create (a Ticket, a
// CDW creative brief, …). Each module owns its own route(s) and — for add-on modules
// — its own SharePoint list + service + components. The app shell never branches on
// module type: the header "+ New" menu and (optionally) the settings tabs are driven
// entirely by FORM_MODULES.
//
// Adding a form type = add one entry here (importing its manifest from the module's
// own index). Removing one = delete that entry (and the module folder). The built-in
// "ticket" entry keeps the shell behaving exactly as before when no add-ons exist.

import type { ComponentType } from "react";
import type { UserPermissions } from "@/types/rbac";
import type { Ticket } from "@/types/ticket";

// An optional admin panel a module can contribute to the Settings page.
export interface FormModuleSettingsTab {
  id: string;
  label: string;
  // Lazy loader so the settings page can code-split the panel.
  load: () => Promise<{ default: ComponentType }>;
  visibleWhen?: (perms: UserPermissions | null) => boolean;
}

// Props every module-contributed ticket-detail action component receives.
export interface TicketDetailActionProps {
  ticket: Ticket;
}

// An optional action a module can contribute to the ticket details panel (e.g.
// the purchase module's "Convert to Purchase Request" button). Lazy-loaded like
// FormModuleSettingsTab so the manifest stays plain data — no component imports
// at module-eval time, and core keeps no static dependency on the module.
export interface FormModuleTicketDetailAction {
  id: string;
  load: () => Promise<{ default: ComponentType<TicketDetailActionProps> }>;
  // Ticket-level render gate evaluated by the details panel. Permission-level
  // gating can also live inside the component itself (returning null), which is
  // how ConvertToPurchaseButton behaves.
  visibleWhen?: (ticket: Ticket, perms: UserPermissions | null) => boolean;
}

export interface FormModule {
  id: string;
  // Human label for the thing (e.g. "Ticket", "Creative Brief (CDW)").
  label: string;
  // Label for the "+ New" menu item; defaults to `New ${label}`.
  newLabel?: string;
  // Whether this module is creatable from the "+ New" menu.
  creatable: boolean;
  // Route to the create form.
  newHref: string;
  // Whether the current user may create/see this module.
  visibleWhen: (perms: UserPermissions | null) => boolean;
  // Optional admin tabs contributed to Settings.
  settingsTabs?: FormModuleSettingsTab[];
  // Optional actions contributed to the ticket details panel.
  ticketDetailActions?: FormModuleTicketDetailAction[];
  // Route prefixes that are public + token-authorized (auth bootstrap is skipped for
  // them in the app layout), e.g. an email-approval landing page.
  publicRoutePrefixes?: string[];
}

// Built-in module: the existing helpdesk ticket. Always present; with no add-on
// modules the "+ New" menu collapses to a single link identical to the old behavior.
const ticketModule: FormModule = {
  id: "ticket",
  label: "Ticket",
  newLabel: "New Ticket",
  creatable: true,
  newHref: "/new",
  visibleWhen: () => true,
};

// === Form modules ===========================================================
// Add-on modules are imported from their own folders and listed below. Deleting a
// module = remove its import + the one array entry here (plus its folder/list).
import { cdwModule } from "@/modules/cdw";
import { purchaseModule } from "@/modules/purchase";

export const FORM_MODULES: FormModule[] = [ticketModule, cdwModule, purchaseModule];

// Modules the given user can create, in menu order.
export function creatableModules(perms: UserPermissions | null): FormModule[] {
  return FORM_MODULES.filter((m) => m.creatable && m.visibleWhen(perms));
}

// All settings tabs contributed by visible modules.
export function moduleSettingsTabs(perms: UserPermissions | null): FormModuleSettingsTab[] {
  return FORM_MODULES.filter((m) => m.visibleWhen(perms)).flatMap((m) =>
    (m.settingsTabs ?? []).filter((t) => !t.visibleWhen || t.visibleWhen(perms))
  );
}

// All ticket-detail actions contributed by modules. Static (FORM_MODULES is fixed
// at build time) so the details panel can wrap each `load` in next/dynamic once at
// module scope; per-ticket visibility is filtered at render time via `visibleWhen`.
export function allTicketDetailActions(): FormModuleTicketDetailAction[] {
  return FORM_MODULES.flatMap((m) => m.ticketDetailActions ?? []);
}

// Public (token-authorized) route prefixes contributed by modules. The app layout
// skips auth bootstrapping for these so the ?token= isn't lost to a login redirect.
export function modulePublicRoutePrefixes(): string[] {
  return FORM_MODULES.flatMap((m) => m.publicRoutePrefixes ?? []);
}
