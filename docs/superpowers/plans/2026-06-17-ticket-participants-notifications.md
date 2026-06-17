# Ticket Participants & Notifications (Piece C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ticket an explicit participant audience (auto-discovered + manually added) and route comment, approval-decision, and status-change notifications to it — with internal staff notes never reaching non-staff.

**Architecture:** A pure resolver (`src/lib/participants.ts`) computes the participant email set from primitives (requester, assignee, approver, prior commenters, and a new `ParticipantEmails` column). A `Participants` UI section on the ticket lets anyone with access add directory people. Comment, decision, and status notification paths route through the resolver; internal comments are filtered to participants who are staff (admin/support RBAC groups). Spec: `docs/superpowers/specs/2026-06-16-email-first-approvals-and-participants-design.md`.

**Tech Stack:** Next.js 14 (React client components), TypeScript, Microsoft Graph (directory search + SharePoint), Vitest (new — frontend unit tests). The resolver is pure (primitive in/out) so it needs no module aliases or DOM.

**Sibling plan:** `2026-06-17-email-first-approvals.md` (Piece A). Piece A's server already reads the `ParticipantEmails` column this plan introduces, so order is flexible; this plan can ship before or after Piece A.

---

## File Structure

**New:**
- `src/lib/participants.ts` — pure resolver: collect, parse/serialize, staff-subset.
- `src/lib/participants.test.ts` — Vitest unit tests.
- `src/components/ParticipantsPanel.tsx` — Participants UI (chips + directory add).
- `vitest.config.ts` — Vitest config.

**Modified:**
- `package.json` — add `vitest` devDep + `test` scripts.
- `src/types/ticket.ts` — add `participantEmails` to `Ticket` + parse in `mapToTicket`.
- `src/lib/graphClient.ts` — `updateTicketParticipants()`.
- `src/lib/rbacService.ts` — `getStaffEmails()` (cached members of admin + support groups).
- `src/components/TicketDetail.tsx` — render `ParticipantsPanel`; route comment + decision notifications through the resolver.
- `src/components/DetailsPanel.tsx` — route status-change email through the resolver.
- `src/app/help/page.tsx` — document participants.

**Config (manual):**
- SharePoint Tickets list — add `ParticipantEmails` (multi-line text) column.

---

## Phase 0 — Prerequisites

### Task 0: Add the `ParticipantEmails` column + Vitest

- [ ] **Step 1: Add the SharePoint column.** In SharePoint → Help Desk site → **Tickets** list → add a column named **`ParticipantEmails`**, type **Multiple lines of text** (plain text). No default. (The internal name must be exactly `ParticipantEmails`.)

- [ ] **Step 2: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Add test scripts.** In `package.json` `scripts`, add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts`** at the repo root:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit 0 is fine) — confirms the toolchain is installed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for frontend unit tests"
```

---

## Phase 1 — Participant resolver (TDD)

### Task 1: `participants.ts`

**Files:**
- Create: `src/lib/participants.ts`
- Create: `src/lib/participants.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/participants.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  collectParticipants,
  parseParticipantEmails,
  serializeParticipantEmails,
  staffSubset,
} from "./participants";

describe("parse/serialize", () => {
  it("parses delimited strings, trims, drops blanks", () => {
    expect(parseParticipantEmails("a@x.com; b@x.com ,, c@x.com")).toEqual([
      "a@x.com", "b@x.com", "c@x.com",
    ]);
    expect(parseParticipantEmails(undefined)).toEqual([]);
    expect(parseParticipantEmails("")).toEqual([]);
  });

  it("serializes with a consistent delimiter", () => {
    expect(serializeParticipantEmails(["a@x.com", "b@x.com"])).toBe("a@x.com; b@x.com");
  });
});

describe("collectParticipants", () => {
  it("unions all sources, lowercases, dedupes, excludes the actor", () => {
    const result = collectParticipants(
      {
        requesterEmail: "Req@X.com",
        assigneeEmail: "assignee@x.com",
        approverEmail: "gm@x.com",
        approvalRequesterEmail: "asker@x.com",
        manualEmails: ["vendor@x.com", "req@x.com"],
        commenterEmails: ["tom@x.com", "assignee@x.com"],
      },
      "gm@x.com"
    );
    expect(result.sort()).toEqual(
      ["asker@x.com", "assignee@x.com", "req@x.com", "tom@x.com", "vendor@x.com"].sort()
    );
    expect(result).not.toContain("gm@x.com");
  });

  it("handles missing fields gracefully", () => {
    expect(collectParticipants({ requesterEmail: "a@x.com" }, undefined)).toEqual(["a@x.com"]);
    expect(collectParticipants({}, "a@x.com")).toEqual([]);
  });
});

describe("staffSubset", () => {
  it("keeps only emails present in the staff set (case-insensitive)", () => {
    const staff = ["assignee@x.com", "GM@x.com"];
    expect(staffSubset(["req@x.com", "assignee@x.com", "gm@x.com"], staff).sort()).toEqual(
      ["assignee@x.com", "gm@x.com"].sort()
    );
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./participants`.

- [ ] **Step 3: Implement** — `src/lib/participants.ts`:

```typescript
// Pure participant resolution. Takes primitives only (no Ticket import) so it is
// trivially unit-testable and free of module-alias/DOM concerns.

export interface ParticipantInput {
  requesterEmail?: string;
  assigneeEmail?: string;
  approverEmail?: string;
  approvalRequesterEmail?: string;
  manualEmails?: string[];
  commenterEmails?: string[];
}

const clean = (e?: string): string | null => {
  if (!e || typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.length ? t : null;
};

// Parse a delimited ParticipantEmails column value into a clean email array.
export function parseParticipantEmails(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

// Serialize an email array back into the column's delimited form.
export function serializeParticipantEmails(emails: string[]): string {
  return emails.join("; ");
}

// Union all participant sources, lowercased + deduped, minus the actor.
export function collectParticipants(input: ParticipantInput, excludeEmail?: string): string[] {
  const out = new Set<string>();
  const add = (e?: string) => {
    const c = clean(e);
    if (c) out.add(c);
  };

  add(input.requesterEmail);
  add(input.assigneeEmail);
  add(input.approverEmail);
  add(input.approvalRequesterEmail);
  (input.manualEmails || []).forEach(add);
  (input.commenterEmails || []).forEach(add);

  const exclude = clean(excludeEmail);
  if (exclude) out.delete(exclude);
  return [...out];
}

// Keep only participants whose email appears in the staff set.
export function staffSubset(emails: string[], staffEmails: Iterable<string>): string[] {
  const staff = new Set<string>();
  for (const e of staffEmails) {
    const c = clean(e);
    if (c) staff.add(c);
  }
  return emails.filter((e) => staff.has(clean(e) || ""));
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/participants.ts src/lib/participants.test.ts
git commit -m "feat: add pure ticket-participant resolver with tests"
```

---

## Phase 2 — Ticket model + persistence

### Task 2: Add `participantEmails` to the ticket model

**Files:**
- Modify: `src/types/ticket.ts`

- [ ] **Step 1: Add the field to the `Ticket` interface.** After `approvalNotes?: string;` (line 53), add:

```typescript
  // Participants (manually-added notification audience)
  participantEmails?: string[];
```

- [ ] **Step 2: Parse it in `mapToTicket`.** After the `approvalNotes` mapping (line 223), add:

```typescript
    participantEmails: (fields.ParticipantEmails as string | undefined)
      ? (fields.ParticipantEmails as string).split(/[;,]/).map((e) => e.trim()).filter(Boolean)
      : [],
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/ticket.ts
git commit -m "feat: parse ParticipantEmails column into ticket model"
```

### Task 3: `updateTicketParticipants` in graphClient

**Files:**
- Modify: `src/lib/graphClient.ts`

- [ ] **Step 1: Add the function** after `updateTicket` (after line 313). It writes the delimited column and returns the refreshed ticket:

```typescript
// Update the ParticipantEmails column (manually-added notification audience).
export async function updateTicketParticipants(
  client: Client,
  ticketId: string,
  emails: string[]
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;
  // De-dupe case-insensitively, preserve insertion order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const e of emails) {
    const key = e.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(e.trim());
    }
  }
  await client.api(endpoint).patch({ fields: { ParticipantEmails: deduped.join("; ") } });
  const updated = await client.api(`${endpoint}?$expand=fields`).get();
  invalidateTicketsCache();
  return mapToTicket(updated);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/graphClient.ts
git commit -m "feat: add updateTicketParticipants writer"
```

---

## Phase 3 — Staff-email resolver

### Task 4: `getStaffEmails` in rbacService

Used to gate internal comments to staff participants. Members of the admin group + all support/department groups (from `rbacConfig`), cached per session.

**Files:**
- Modify: `src/lib/rbacService.ts`

- [ ] **Step 1: No new `rbacConfig` import needed.** `ADMIN_EMAILS` is already imported from `./rbacConfig`, and `initRBACConfig` is defined in this same file. Do **NOT** import `ALL_ELEVATED_GROUP_IDS` from `rbacConfig.ts` — that file is explicitly **fallback-only** (`rbacConfig.ts:1-4`); the authoritative elevated-group set comes from the SharePoint RBAC config via `rbacConfigService`.

- [ ] **Step 2: Add a cache + resolver** at the end of the file. Use the SharePoint-derived `config.elevatedGroupIds` (admin + department + purchaser + inventory), not the hardcoded fallback — this gate decides who may receive internal notes, so it must use the live config:

```typescript
// Cached staff email set (members of the elevated RBAC groups) for internal-note gating
let staffEmailsCache: string[] | null = null;

/**
 * Fetch the set of staff emails — members of every elevated group (admin + support +
 * purchaser + inventory) per the authoritative SharePoint RBAC config (NOT the
 * fallback constants). Used to gate internal (staff-only) notes so they never reach
 * the requester or non-staff manually-added participants. Cached per session.
 */
export async function getStaffEmails(client: Client): Promise<string[]> {
  if (staffEmailsCache) return staffEmailsCache;

  const config = await initRBACConfig(client);
  const groupIds = [...config.elevatedGroupIds];

  const memberArrays = await Promise.all(
    groupIds.map(async (groupId) => {
      try {
        const response = await client
          .api(`/groups/${groupId}/members`)
          .select("mail,userPrincipalName")
          .get();
        return (response.value as Array<{ mail?: string; userPrincipalName?: string }>)
          .map((m) => (m.mail || m.userPrincipalName || "").toLowerCase())
          .filter(Boolean);
      } catch (error) {
        console.error(`Failed to fetch staff members for group ${groupId}:`, error);
        return [] as string[];
      }
    })
  );

  const set = new Set<string>();
  for (const arr of memberArrays) for (const e of arr) set.add(e);
  // Hardcoded admins (NEXT_PUBLIC_ADMIN_EMAILS fallback) are staff too
  for (const e of ADMIN_EMAILS) set.add(e.toLowerCase());

  staffEmailsCache = [...set];
  return staffEmailsCache;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rbacService.ts
git commit -m "feat: add cached getStaffEmails for internal-note gating"
```

---

## Phase 4 — Participants UI

### Task 5: `ParticipantsPanel` component

**Files:**
- Create: `src/components/ParticipantsPanel.tsx`

- [ ] **Step 1: Implement.** Shows auto-discovered participants as read-only chips and manual ones as removable chips, with a directory search to add. Uses `searchUsers` (graphClient) and `updateTicketParticipants`.

```tsx
"use client";

import { useState, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment } from "@/types/ticket";
import { getGraphClient, searchUsers, updateTicketParticipants, OrgUser } from "@/lib/graphClient";

interface ParticipantsPanelProps {
  ticket: Ticket;
  comments: Comment[];
  onUpdate: (ticket: Ticket) => void;
}

export default function ParticipantsPanel({ ticket, comments, onUpdate }: ParticipantsPanelProps) {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-discovered participants (read-only chips)
  const autoEmails = useMemo(() => {
    const set = new Map<string, string>(); // lowercased -> display
    const add = (email?: string, name?: string) => {
      if (!email) return;
      const key = email.toLowerCase();
      if (!set.has(key)) set.set(key, name || email);
    };
    add(ticket.requester.email, `${ticket.requester.displayName} (requester)`);
    add(ticket.originalAssignedTo || ticket.assignedTo?.email, ticket.assignedTo?.displayName || "Assignee");
    add(ticket.approvedBy?.email, ticket.approvedBy?.displayName ? `${ticket.approvedBy.displayName} (approver)` : undefined);
    comments.filter((c) => !c.isInternal).forEach((c) => add(c.createdBy.email, c.createdBy.displayName));
    return set;
  }, [ticket, comments]);

  const manualEmails = ticket.participantEmails || [];

  const runSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2 || !accounts[0]) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      setResults(await searchUsers(client, q.trim(), 8));
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = async (user: OrgUser) => {
    if (!accounts[0] || !user.email) return;
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const updated = await updateTicketParticipants(client, ticket.id, [...manualEmails, user.email]);
      onUpdate(updated);
      setQuery("");
      setResults([]);
    } catch (e) {
      console.error("Failed to add participant:", e);
    } finally {
      setSaving(false);
    }
  };

  const removeParticipant = async (email: string) => {
    if (!accounts[0]) return;
    setSaving(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const next = manualEmails.filter((e) => e.toLowerCase() !== email.toLowerCase());
      const updated = await updateTicketParticipants(client, ticket.id, next);
      onUpdate(updated);
    } catch (e) {
      console.error("Failed to remove participant:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-2">Participants</h3>
      <p className="text-xs text-text-secondary mb-3">Everyone here is notified of new comments and updates.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {[...autoEmails.entries()].map(([email, label]) => (
          <span key={`auto-${email}`} className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {label}
          </span>
        ))}
        {manualEmails.map((email) => (
          <span key={`manual-${email}`} className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-3 py-1 text-xs text-brand-primary">
            {email}
            <button onClick={() => removeParticipant(email)} disabled={saving} className="ml-1 text-brand-primary/70 hover:text-brand-primary" aria-label={`Remove ${email}`}>×</button>
          </span>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Add a person…"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        {(results.length > 0 || searching) && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-bg-elevated shadow-lg">
            {searching && <p className="px-3 py-2 text-xs text-text-secondary">Searching…</p>}
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => addParticipant(u)}
                disabled={saving}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{u.displayName}</span>
                <span className="text-text-secondary"> · {u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `OrgUser` is not exported from graphClient, confirm with `grep -n "export interface OrgUser" src/lib/graphClient.ts` — it is, at line ~799.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ParticipantsPanel.tsx
git commit -m "feat: add ParticipantsPanel UI with directory add"
```

### Task 6: Render `ParticipantsPanel` in `TicketDetail`

**Files:**
- Modify: `src/components/TicketDetail.tsx`

- [ ] **Step 1: Import it.** With the other component imports (after line 39, `import ApprovalActionPanel`):

```typescript
import ParticipantsPanel from "./ParticipantsPanel";
```

- [ ] **Step 2: Render it.** Locate where `DetailsPanel` is rendered in the JSX:

Run: `grep -n "<DetailsPanel" src/components/TicketDetail.tsx`

Add directly above (or below) that element, passing the loaded `comments` and the existing `onUpdate`:

```tsx
            <ParticipantsPanel ticket={ticket} comments={comments} onUpdate={onUpdate} />
```

- [ ] **Step 3: Build to confirm it renders**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/TicketDetail.tsx
git commit -m "feat: show Participants section on ticket detail"
```

---

## Phase 5 — Notification routing

### Task 7: Route comment notifications through participants

Replace the requester+assignee-only block (`TicketDetail.tsx:260-286`) so public comments notify all participants and internal comments notify staff participants.

**Files:**
- Modify: `src/components/TicketDetail.tsx`

- [ ] **Step 1: Add imports.** Add to the `@/lib/graphClient` import group: `getStaffEmails` is in `rbacService`, so add a new import line near the top:

```typescript
import { collectParticipants, staffSubset } from "@/lib/participants";
import { getStaffEmails } from "@/lib/rbacService";
```

- [ ] **Step 2: Replace the notification block.** Replace the entire `if (!isInternal) { ... }` block at lines 260-286 with:

```typescript
      // Notify participants. Public comments -> everyone; internal notes -> staff only.
      try {
        const participants = collectParticipants(
          {
            requesterEmail: ticket.requester.email,
            assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
            approverEmail: ticket.approvedBy?.email,
            approvalRequesterEmail: ticket.approvalRequestedBy?.email,
            manualEmails: ticket.participantEmails,
            commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
          },
          commenterEmail
        );

        let recipients = participants;
        if (isInternal) {
          const staffEmails = await getStaffEmails(client);
          recipients = staffSubset(participants, staffEmails);
        }

        const requesterEmailLc = ticket.requester.email?.toLowerCase();
        await Promise.all(
          recipients.map((email) =>
            sendCommentEmail(client, ticket, email, commenterName, text, email === requesterEmailLc).catch((e) =>
              console.error(`Failed to send comment email to ${email}:`, e)
            )
          )
        );
      } catch (e) {
        console.error("Failed to send comment notifications:", e);
      }
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/TicketDetail.tsx
git commit -m "feat: route comment notifications to all participants (internal->staff only)"
```

### Task 8: Add participants to decision-email recipients

**Files:**
- Modify: `src/components/TicketDetail.tsx`

- [ ] **Step 1: Union participants into the decision recipients.** In `handleApprovalDecision`, after the existing `decisionRecipients` set is built and the approver removed (after line 516), add:

```typescript
    // Also notify participants of the decision
    collectParticipants(
      {
        requesterEmail: ticket.requester.email,
        assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
        approverEmail: ticket.approvedBy?.email,
        approvalRequesterEmail: updatedTicket.approvalRequestedBy?.email || ticket.approvalRequestedBy?.email,
        manualEmails: ticket.participantEmails,
        commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
      },
      approverEmail
    ).forEach((email) => decisionRecipients.add(email));
```

(`collectParticipants` is already imported from Task 7.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TicketDetail.tsx
git commit -m "feat: include participants in approval decision emails"
```

### Task 9: Route status-change emails through participants

Replace the requester-only status email (`DetailsPanel.tsx:410-436`) with participant fan-out.

**Files:**
- Modify: `src/components/DetailsPanel.tsx` (props + status email)
- Modify: `src/components/TicketDetail.tsx` (pass `comments` to `DetailsPanel`)

- [ ] **Step 1: Thread `comments` into `DetailsPanel`** so the status fanout can include prior public commenters (the spec defines participants as requester + assignee + approver + **commenters** + manual adds; `DetailsPanel` previously had no comment data).

  a. In `DetailsPanel.tsx`, add the imports (skip `Comment` if already imported):

```typescript
import { collectParticipants } from "@/lib/participants";
import { Comment } from "@/types/ticket";
```

  b. Add `comments` to the props interface and destructure it with a safe default:

```typescript
// In DetailsPanelProps:
  comments?: Comment[];
// In the component signature, add to the destructure: `comments = []`
```

  c. In `TicketDetail.tsx`, pass the already-loaded comments to the panel:

Run: `grep -n "<DetailsPanel" src/components/TicketDetail.tsx`

Add `comments={comments}` to that `<DetailsPanel ... />` element.

- [ ] **Step 2: Replace the status-email block** at `DetailsPanel.tsx:410-436` with participant fan-out that **includes commenters**:

```typescript
      // Notify all participants if status changed (email)
      if (status !== oldStatus) {
        const participants = collectParticipants(
          {
            requesterEmail: ticket.requester.email,
            assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
            approverEmail: ticket.approvedBy?.email,
            approvalRequesterEmail: ticket.approvalRequestedBy?.email,
            manualEmails: ticket.participantEmails,
            commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
          },
          accounts[0].username
        );
        participants.forEach((email) =>
          sendStatusChangeEmail(client, updated, email, oldStatus, currentUserName).catch((e) =>
            console.error(`Failed to send status change email to ${email}:`, e)
          )
        );
        logActivity(client, {
          eventType: "email_sent",
          ticketId: ticket.id,
          ticketNumber,
          actor: accounts[0].username,
          actorName: currentUserName,
          description: `Status change notification sent to ${participants.length} participant(s)`,
          details: JSON.stringify({ emailType: "status_change_notification", recipients: participants, oldStatus, newStatus: status }),
        }).catch((e) => console.error("Failed to log email sent:", e));
      }
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/DetailsPanel.tsx src/components/TicketDetail.tsx
git commit -m "feat: send status-change emails to all participants"
```

---

## Phase 6 — Verify + help docs

### Task 10: End-to-end verification

- [ ] **Step 1: Run the unit tests**

Run: `npm test`
Expected: participants suite passes.

- [ ] **Step 2: Manual test (after deploy to `main`).** On a test ticket:
  - Open the ticket → confirm the **Participants** section shows the requester/assignee chips.
  - Add a directory person → confirm their chip appears and persists on reload (column saved).
  - Post a **public** comment as another user → confirm the requester, assignee, and added participant all receive the email; the commenter does not.
  - Post an **internal** note → confirm only staff participants receive it and the requester (if non-staff) does **not**.
  - Change the ticket status → confirm all participants receive the status email.
  - Approve/deny → confirm participants are included in the decision email.

### Task 11: Update help documentation (required by project conventions)

**Files:**
- Modify: `src/app/help/page.tsx`

- [ ] **Step 1: Find the notifications section**

Run: `grep -n "id: \"" src/app/help/page.tsx`

- [ ] **Step 2: Add (or extend) a participants section:**

```tsx
{
  id: "participants",
  title: "Participants & Notifications",
  content: (
    <div className="space-y-4">
      <p>Each ticket has a <strong>Participants</strong> list — everyone who gets notified of new activity.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Automatic:</strong> the requester, the assignee, the approver, and anyone who has commented.</li>
        <li><strong>Manual:</strong> add anyone from the company directory in the Participants box on the ticket.</li>
      </ul>
      <p>Participants are emailed on every new comment, approval decision, and status change.</p>
      <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm">
        <strong>Note:</strong> Internal staff notes are only sent to staff participants — they are never emailed to the requester or to non-staff people you add.
      </div>
    </div>
  ),
},
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/help/page.tsx
git commit -m "docs: add Participants & Notifications help section"
```

---

## Post-Codex-Review Revisions (2026-06-17)

Revised after an adversarial Codex review:
- **`getStaffEmails` source** (Task 4) now uses `initRBACConfig()` + the SharePoint-derived `config.elevatedGroupIds`, not the fallback-only `ALL_ELEVATED_GROUP_IDS`. This is the internal-note gate, so it must use the authoritative config — otherwise notes could mis-route.
- **Status-change fanout** (Task 9) now threads `comments` into `DetailsPanel` and includes prior public commenters, matching the spec's participant definition.
- **Purchase-workflow step emails (scope decision):** the spec's routing table listed "purchase-workflow step → participants," but ordered/received emails stay role-targeted (purchaser/inventory) + requester. Participants are covered via comments, the approval **decision** email, and ticket **status-change** emails — not separately on PurchaseStatus transitions. The spec routing table has been narrowed to match. Expanding to per-purchase-step participant fanout is a small follow-up if desired.

## Self-Review Checklist (completed during planning)

- **Spec coverage:** all-participants model (Task 1 resolver; Tasks 7-9 routing) ✓; manual add by anyone with access, directory-only (Task 5 UI) ✓; internal notes → staff only (Tasks 1 `staffSubset`, 4 `getStaffEmails`, 7 routing) ✓; added participants get comments + decisions + status (Tasks 7,8,9) ✓; `ParticipantEmails` single text column (Tasks 0,2,3) ✓; every comment notifies, no batching (Task 7) ✓; help docs (Task 11) ✓.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type/name consistency:** `collectParticipants`/`parseParticipantEmails`/`serializeParticipantEmails`/`staffSubset` (resolver), `updateTicketParticipants`, `getStaffEmails`, `participantEmails` (model), `ParticipantsPanel` — consistent across Tasks 1-11.
- **Interaction with Piece A:** Piece A's `approvalAction` already reads `ParticipantEmails`; once this plan's column + writer exist, email-path decisions notify the same participant set as in-app decisions.
- **Out of scope:** inbound email→comment (Piece B), auth-popup reduction (Piece D), external (non-directory) participants, notification mute/unsubscribe.
