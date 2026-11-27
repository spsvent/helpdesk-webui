// Quick Fix Log form-module manifest — the ONLY thing the app shell imports from
// this module. Plain data, like the CDW and purchase manifests.
//
// What it is: IT's log of fixes that never had a ticket (pick a location + a
// common issue, add a note/photo). Saved to its own SharePoint lists; it never
// emails, posts to Teams, syncs to To Do/Vikunja, or touches ticket counts.
//
// To remove the module cleanly:
//   1. delete src/modules/fixlog/ and src/app/fixlog/
//   2. remove the fixLogModule import + array entry in src/shared/formModules.ts
//   3. remove the help section (id "quick-fix-log") in src/app/help/page.tsx
//   4. drop NEXT_PUBLIC_FIXLOG_LIST_ID / NEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID from the
//      workflow + .env.local.example, and the rows in docs/INTEGRATION.md
//   5. archive the QuickFixLog + QuickFixIssues SharePoint lists

import type { FormModule } from "@/shared/formModules";
import { canUseFixLog } from "./access";
import { isFixLogConfigured } from "./fixLogService";

export const fixLogModule: FormModule = {
  id: "fixlog",
  label: "Quick Fix",
  newLabel: "Log a quick fix",
  newDescription: "IT: record a fix that didn't have a ticket",
  creatable: true,
  newHref: "/fixlog",
  // IT only (admins + Tech department), and hidden until the list is configured.
  visibleWhen: (perms) => isFixLogConfigured() && canUseFixLog(perms),
  workspaceHref: "/fixlog",
  workspaceLabel: "Fix Log",
  workspaceOrder: 30,
};
