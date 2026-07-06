// CDW form-module manifest entry — the ONLY thing the app shell imports from this
// module. Plain data (no component imports at eval time) so it can be listed in
// FORM_MODULES without pulling client components into the shell.
//
// To remove the CDW feature cleanly:
//   1. delete src/modules/cdw/ and src/app/cdw/
//   2. delete the CDW Azure Functions (sendCdwApprovalRequest, cdwApprovalAction,
//      lib/cdwEmailTemplates, lib/cdwDecisionFields) + their test
//   3. remove the cdwModule import + array entry in src/shared/formModules.ts
//   4. remove the CDW help section (id "creative-briefs-cdw") in src/app/help/page.tsx
//   5. drop the NEXT_PUBLIC_CDW_* env vars (+ the Function App CDW_LIST_ID)
//   6. archive the CDW SharePoint list
// Nothing else in core references this module — the shell reads it only via the manifest.

import type { FormModule } from "@/shared/formModules";
import { canCreateCdw } from "./access";

export const cdwModule: FormModule = {
  id: "cdw",
  label: "Creative Brief (CDW)",
  newLabel: "New creative brief (CDW)",
  newDescription: "Kick off a design or campaign project",
  // CDW routes to a GM for approval; hardcoded blue accent per the design (#2A6FDB).
  welcomeTile: {
    description: "Kick off a design or campaign project — routed to a GM for approval.",
    accent: "#2A6FDB",
  },
  creatable: true,
  newHref: "/cdw/new",
  // Gated by canCreateCdw (see access.ts): any signed-in user by default, or a
  // configurable requesters group. Approval is gated separately (GM/admin).
  visibleWhen: canCreateCdw,
  // The email-approval landing page authorizes via its token, not a login session.
  publicRoutePrefixes: ["/cdw/approve"],
};
