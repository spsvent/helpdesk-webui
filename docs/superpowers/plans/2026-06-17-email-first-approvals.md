# Email-First Approvals (Piece A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let approvers Approve / Deny / Request Changes on any ticket (including purchase requests) directly from an email, via signed links and a branded no-login confirmation page, with an optional inline note.

**Architecture:** A new Azure Function `approvalAction` validates an HMAC-signed token and executes the decision server-side with app-only Graph (mirroring `processApprovalDecision`). A new Function `sendApprovalRequest` mints per-recipient signed tokens and sends the approval email. A new static page `/approve` reads the token, shows a confirmation card (GET = side-effect-free summary), and submits the decision + note (POST). Spec: `docs/superpowers/specs/2026-06-16-email-first-approvals-and-participants-design.md`.

**Tech Stack:** Azure Functions v4 (Node 24, `@azure/functions`, `@azure/msal-node`, `@microsoft/microsoft-graph-client`), Node built-in `node:test` + `node:crypto` (zero new deps), Next.js 14 static export (React client page).

**Sibling plan:** `2026-06-17-ticket-participants-notifications.md` (Piece C). Piece A sends its decision email to "participants"; until Piece C lands, the server uses a built-in fallback recipient set (requester + assignee + approver). The two plans are independently shippable.

---

## File Structure

**Azure Functions (`azure-functions/`)** — new files:
- `src/lib/approvalToken.js` — HMAC sign/verify of action tokens. Pure, unit-tested.
- `src/lib/decisionFields.js` — maps a decision to the SharePoint field patch (mirror of `processApprovalDecision`). Pure, unit-tested.
- `src/lib/approvalRecipients.js` — resolves decision-email recipients from ticket fields + comments. Pure-ish, unit-tested for the pure parts.
- `src/lib/emailTemplates.js` — server-side HTML for the approval-request email, decision email, and purchase-approved email.
- `src/lib/graphHelpers.js` — shared app-only token + Graph client + `sendMail` (extracted from the duplicated pattern in `sendEmail.js`/`checkEscalations.js`).
- `src/functions/approvalAction.js` — HTTP endpoint: `GET` summary, `POST` execute.
- `src/functions/sendApprovalRequest.js` — HTTP endpoint: mint tokens + send approval email.
- `test/approvalToken.test.js`, `test/decisionFields.test.js`, `test/approvalRecipients.test.js` — `node:test` suites.

**Frontend (`src/`)** — new/modified:
- `src/app/approve/page.tsx` — new no-login confirmation page.
- `src/app/layout.tsx` — guard `validateCachedSession` so `/approve` is never redirected.
- `src/lib/graphClient.ts` — replace the client-built approval email with a call to `sendApprovalRequest`.
- `src/components/TicketDetail.tsx` — call the new approval-request trigger where `sendApprovalRequestEmail` is used today.

**Config:**
- `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml` — add `NEXT_PUBLIC_APPROVAL_ACTION_URL`, `NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL`.
- Function App settings (Azure Portal) — add `APPROVAL_LINK_SECRET`, `ACTIVITY_LOG_LIST_ID`, `GENERAL_MANAGERS_GROUP_ID`, `PURCHASER_GROUP_ID`, `APP_URL` (verify present).

---

## Phase 0 — Prerequisites (manual config, no code)

### Task 0: Provision secret + env vars

- [ ] **Step 1: Generate and set the signing secret**

Generate a 32-byte secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set it in **Azure Portal → Function Apps → helpdesk-notify-func → Settings → Environment variables** as `APPROVAL_LINK_SECRET` (value = the hex string). Also add it to `azure-functions/local.settings.json` under `Values` for local testing:

```json
"APPROVAL_LINK_SECRET": "<paste-hex-here>",
"ACTIVITY_LOG_LIST_ID": "a961cb69-a588-4ca0-aa04-b421ebcc792a",
"GENERAL_MANAGERS_GROUP_ID": "db86fdc8-dbf7-4ec9-af9f-461bb63735ed",
"PURCHASER_GROUP_ID": "6afebd3e-069c-41a2-94d8-6e7b93634bb3"
```

> `local.settings.json` is gitignored — do not commit the secret. The Portal value is the production source of truth.

- [ ] **Step 2: Verify Function App already has** `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `SENDER_EMAIL`, `SHAREPOINT_SITE_ID`, `TICKETS_LIST_ID`, `COMMENTS_LIST_ID`, `APP_URL` (they do per `checkEscalations.js`). No action if present.

- [ ] **Step 3: Add the build-time URLs to the workflow.** Edit `.github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml`, in the `env:` block after line 51 (`NEXT_PUBLIC_EMAIL_FUNCTION_URL`), add:

```yaml
          NEXT_PUBLIC_APPROVAL_ACTION_URL: "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/approvalaction"
          NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL: "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api/sendapprovalrequest"
```

- [ ] **Step 4: Commit the workflow change**

```bash
git add .github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml
git commit -m "chore: add approval action + send-approval-request function URLs"
```

---

## Phase 1 — Token signing module (TDD)

### Task 1: `approvalToken.js` — sign & verify

**Files:**
- Create: `azure-functions/src/lib/approvalToken.js`
- Create: `azure-functions/test/approvalToken.test.js`
- Modify: `azure-functions/package.json` (test script)

- [ ] **Step 1: Add the test script.** In `azure-functions/package.json`, change the `"test"` script:

```json
  "scripts": {
    "start": "func start",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test** — `azure-functions/test/approvalToken.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");

// Force a known secret BEFORE requiring the module
process.env.APPROVAL_LINK_SECRET = "test-secret-please-ignore";
const { signToken, verifyToken } = require("../src/lib/approvalToken");

const basePayload = { tid: "42", action: "approve", email: "gm@x.com", name: "GM" };

test("round-trips a valid token", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const result = verifyToken(token, { now: 1050 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.payload.tid, "42");
  assert.strictEqual(result.payload.action, "approve");
  assert.strictEqual(result.payload.email, "gm@x.com");
});

test("rejects an expired token", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const result = verifyToken(token, { now: 2000 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "expired");
});

test("rejects a tampered payload", () => {
  const token = signToken(basePayload, { now: 1000, ttlSeconds: 100 });
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...basePayload, action: "approve", tid: "999" })).toString("base64url");
  const result = verifyToken(`${forged}.${sig}`, { now: 1050 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, "bad_signature");
});

test("rejects a malformed token", () => {
  assert.strictEqual(verifyToken("garbage", { now: 1 }).valid, false);
  assert.strictEqual(verifyToken("a.b.c", { now: 1 }).valid, false);
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `cd azure-functions && npm test`
Expected: FAIL — `Cannot find module '../src/lib/approvalToken'`.

- [ ] **Step 4: Implement** — `azure-functions/src/lib/approvalToken.js`:

```javascript
const crypto = require("node:crypto");

const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getSecret() {
  const secret = process.env.APPROVAL_LINK_SECRET;
  if (!secret) throw new Error("APPROVAL_LINK_SECRET is not configured");
  return secret;
}

function sign(body) {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

// payload: { tid, action, email, name }
function signToken(payload, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const full = {
    ...payload,
    iat: now,
    exp: now + ttl,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function verifyToken(token, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof token !== "string") return { valid: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [body, sig] = parts;

  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (typeof payload.exp !== "number" || now > payload.exp) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, payload };
}

module.exports = { signToken, verifyToken, DEFAULT_TTL_SECONDS };
```

- [ ] **Step 5: Run it — verify it passes**

Run: `cd azure-functions && npm test`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add azure-functions/src/lib/approvalToken.js azure-functions/test/approvalToken.test.js azure-functions/package.json
git commit -m "feat: add HMAC approval-token sign/verify module"
```

---

## Phase 2 — Decision field mapping (TDD)

### Task 2: `decisionFields.js`

Mirrors the field logic in `graphClient.ts:processApprovalDecision` (lines 502-557) so the server writes identical SharePoint fields.

**Files:**
- Create: `azure-functions/src/lib/decisionFields.js`
- Create: `azure-functions/test/decisionFields.test.js`

- [ ] **Step 1: Write the failing test** — `azure-functions/test/decisionFields.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { actionToDecision, buildDecisionFields } = require("../src/lib/decisionFields");

test("maps actions to decisions", () => {
  assert.strictEqual(actionToDecision("approve"), "Approved");
  assert.strictEqual(actionToDecision("deny"), "Denied");
  assert.strictEqual(actionToDecision("changes"), "Changes Requested");
});

test("approve on a non-purchase ticket", () => {
  const f = buildDecisionFields("Approved", "GM", "gm@x.com", "looks good", false, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Approved");
  assert.strictEqual(f.ApprovedByName, "GM");
  assert.strictEqual(f.ApprovedByEmail, "gm@x.com");
  assert.strictEqual(f.ApprovalNotes, "looks good");
  assert.strictEqual(f.ApprovalDate, "2026-06-17T00:00:00Z");
  assert.ok(!("PurchaseStatus" in f));
});

test("approve on a purchase ticket also sets PurchaseStatus", () => {
  const f = buildDecisionFields("Approved", "GM", "gm@x.com", undefined, true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Approved");
  assert.strictEqual(f.PurchaseStatus, "Approved");
  assert.ok(!("ApprovalNotes" in f));
});

test("deny on a purchase ticket sets PurchaseStatus Denied", () => {
  const f = buildDecisionFields("Denied", "GM", "gm@x.com", "no budget", true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Denied");
  assert.strictEqual(f.PurchaseStatus, "Denied");
});

test("changes requested leaves PurchaseStatus untouched", () => {
  const f = buildDecisionFields("Changes Requested", "GM", "gm@x.com", "swap vendor", true, "2026-06-17T00:00:00Z");
  assert.strictEqual(f.ApprovalStatus, "Changes Requested");
  assert.ok(!("PurchaseStatus" in f));
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd azure-functions && npm test`
Expected: FAIL — `Cannot find module '../src/lib/decisionFields'`.

- [ ] **Step 3: Implement** — `azure-functions/src/lib/decisionFields.js`:

```javascript
// The email-first flow only supports these three actions.
const ACTION_TO_DECISION = {
  approve: "Approved",
  deny: "Denied",
  changes: "Changes Requested",
};

function actionToDecision(action) {
  return ACTION_TO_DECISION[action] || null;
}

// Mirror of processApprovalDecision() field logic in src/lib/graphClient.ts.
// decision is "Approved" | "Denied" | "Changes Requested".
function buildDecisionFields(decision, approverName, approverEmail, notes, isPurchaseRequest, nowIso) {
  const fields = {
    ApprovalStatus: decision,
    ApprovalDate: nowIso,
    ApprovedByName: approverName,
    ApprovedByEmail: approverEmail,
  };
  if (notes) fields.ApprovalNotes = notes;

  if (isPurchaseRequest) {
    if (decision === "Approved") fields.PurchaseStatus = "Approved";
    else if (decision === "Denied") fields.PurchaseStatus = "Denied";
    // "Changes Requested" leaves PurchaseStatus unchanged
  }
  return fields;
}

// Terminal decisions lock the email links. "Changes Requested" is non-terminal.
function isTerminalStatus(approvalStatus) {
  return approvalStatus === "Approved" || approvalStatus === "Denied";
}

module.exports = { actionToDecision, buildDecisionFields, isTerminalStatus };
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd azure-functions && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add azure-functions/src/lib/decisionFields.js azure-functions/test/decisionFields.test.js
git commit -m "feat: add server-side decision->fields mapping"
```

---

## Phase 3 — Recipient resolver (TDD)

### Task 3: `approvalRecipients.js`

Computes the decision-email recipients from ticket fields, the optional `ParticipantEmails` column (Piece C), prior commenters, minus the approver.

**Files:**
- Create: `azure-functions/src/lib/approvalRecipients.js`
- Create: `azure-functions/test/approvalRecipients.test.js`

- [ ] **Step 1: Write the failing test** — `azure-functions/test/approvalRecipients.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { resolveDecisionRecipients } = require("../src/lib/approvalRecipients");

test("unions requester, assignee, approval-requester, participants and commenters; excludes approver", () => {
  const fields = {
    RequesterEmail: "req@x.com",
    OriginalAssignedTo: "assignee@x.com",
    ApprovalRequestedByEmail: "asker@x.com",
    ParticipantEmails: "vendor@x.com; extra@x.com",
  };
  const commenterEmails = ["tom@x.com", "req@x.com"];
  const recipients = resolveDecisionRecipients(fields, commenterEmails, "assignee@x.com");
  assert.deepStrictEqual(
    [...recipients].sort(),
    ["asker@x.com", "extra@x.com", "req@x.com", "tom@x.com", "vendor@x.com"].sort()
  );
  assert.ok(!recipients.includes("assignee@x.com"));
});

test("dedupes case-insensitively and ignores blanks", () => {
  const fields = { RequesterEmail: "Req@X.com", ParticipantEmails: "req@x.com;; ,  " };
  const recipients = resolveDecisionRecipients(fields, [], "");
  assert.deepStrictEqual(recipients, ["req@x.com"]);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd azure-functions && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `azure-functions/src/lib/approvalRecipients.js`:

```javascript
// Split a delimited ParticipantEmails string ("; " or "," separated) into emails.
function splitEmails(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
}

// fields: raw SharePoint ticket fields. commenterEmails: emails of prior commenters.
// excludeEmail: the actor (approver) to omit. Returns a deduped lowercase array.
function resolveDecisionRecipients(fields, commenterEmails, excludeEmail) {
  const out = new Set();
  const add = (e) => { if (e && typeof e === "string" && e.trim()) out.add(e.trim().toLowerCase()); };

  add(fields.RequesterEmail);
  add(fields.OriginalRequester);
  add(fields.OriginalAssignedTo);
  add(fields.ApprovalRequestedByEmail);
  add(fields.ApprovedByEmail);
  for (const e of splitEmails(fields.ParticipantEmails)) add(e);
  for (const e of commenterEmails || []) add(e);

  if (excludeEmail) out.delete(excludeEmail.trim().toLowerCase());
  return [...out];
}

module.exports = { resolveDecisionRecipients, splitEmails };
```

> Note: `RequesterEmail` may not be a real column. The function reads several possible fields and ignores blanks, so missing columns are harmless. `approvalAction` also passes the requester email it derives from the Graph item (see Task 5).

- [ ] **Step 4: Run — verify it passes**

Run: `cd azure-functions && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add azure-functions/src/lib/approvalRecipients.js azure-functions/test/approvalRecipients.test.js
git commit -m "feat: add server-side decision recipient resolver"
```

---

## Phase 4 — Shared Graph helpers + email templates (no new logic tests; integration-verified)

### Task 4: `graphHelpers.js`

Extract the duplicated app-only-token / Graph-client / sendMail pattern.

**Files:**
- Create: `azure-functions/src/lib/graphHelpers.js`

- [ ] **Step 1: Implement** — `azure-functions/src/lib/graphHelpers.js`:

```javascript
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  senderEmail: process.env.SENDER_EMAIL || "supportdesk@skyparksantasvillage.com",
  siteId: process.env.SHAREPOINT_SITE_ID,
  ticketsListId: process.env.TICKETS_LIST_ID,
  commentsListId: process.env.COMMENTS_LIST_ID,
  activityLogListId: process.env.ACTIVITY_LOG_LIST_ID,
  generalManagersGroupId: process.env.GENERAL_MANAGERS_GROUP_ID,
  purchaserGroupId: process.env.PURCHASER_GROUP_ID,
  appUrl: process.env.APP_URL || "https://tickets.spsvent.net",
};

let msalClient = null;
function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }
  return msalClient;
}

async function getGraphClient() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.init({ authProvider: (done) => done(null, result.accessToken) });
}

async function sendMail(client, toEmail, subject, htmlContent) {
  await client.api(`/users/${config.senderEmail}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: htmlContent },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  });
}

async function getGroupMemberEmails(client, groupId) {
  if (!groupId) return [];
  try {
    const res = await client.api(`/groups/${groupId}/members`).select("mail,userPrincipalName").get();
    return (res.value || []).map((m) => m.mail || m.userPrincipalName).filter(Boolean);
  } catch (e) {
    console.error("getGroupMemberEmails failed:", e.message);
    return [];
  }
}

// Like getGroupMemberEmails but returns { email, displayName } for correct attribution.
async function getGroupMembers(client, groupId) {
  if (!groupId) return [];
  try {
    const res = await client.api(`/groups/${groupId}/members`).select("mail,userPrincipalName,displayName").get();
    return (res.value || [])
      .map((m) => ({ email: m.mail || m.userPrincipalName, displayName: m.displayName }))
      .filter((m) => m.email);
  } catch (e) {
    console.error("getGroupMembers failed:", e.message);
    return [];
  }
}

module.exports = { config, getGraphClient, sendMail, getGroupMemberEmails, getGroupMembers };
```

- [ ] **Step 2: Commit**

```bash
git add azure-functions/src/lib/graphHelpers.js
git commit -m "feat: add shared graph helpers for functions"
```

### Task 5: `emailTemplates.js`

**Files:**
- Create: `azure-functions/src/lib/emailTemplates.js`

- [ ] **Step 1: Implement** — `azure-functions/src/lib/emailTemplates.js`. Styles mirror `src/lib/emailService.ts`. The approval buttons point at the **`/approve` page** with the signed token; the page is on the trusted app domain.

```javascript
const { config } = require("./graphHelpers");

const styles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
  .ticket-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
  .label { font-weight: 600; color: #374151; }
  .actions { text-align: center; margin: 24px 0; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 8px 8px 8px; }
  .btn-approve { background: #10b981; color: white; }
  .btn-deny { background: #ef4444; color: white; }
  .btn-changes { background: #f59e0b; color: white; }
  .btn-view { background: #1e3a5f; color: white; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-approved { background: #d1fae5; color: #065f46; }
  .badge-denied { background: #fee2e2; color: #991b1b; }
  .badge-changes { background: #ffedd5; color: #9a3412; }
  .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 14px; }
`;

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => map[c]);
}

function approveUrl(token, action) {
  // trailingSlash: true -> /approve/. action+token both in the query string.
  return `${config.appUrl}/approve/?action=${action}&token=${encodeURIComponent(token)}`;
}

// tokens: { approve, deny, changes } per-recipient signed tokens
function approvalRequestEmail(fields, ticketRef, requesterName, tokens) {
  const title = escapeHtml(fields.Title);
  const isPurchase = !!fields.IsPurchaseRequest;
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Approval Request</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p><strong>${escapeHtml(requesterName)}</strong> has requested your approval.</p>
      <div class="ticket-info">
        <h3 style="margin:0 0 8px 0;color:#1e3a5f;">${ticketRef}: ${title}</h3>
        <p><span class="label">Category:</span> ${escapeHtml(fields.Category)}</p>
        <p><span class="label">Priority:</span> ${escapeHtml(fields.Priority)}</p>
        <p><span class="label">Requester:</span> ${escapeHtml(requesterName)}</p>
        ${fields.Description ? `<p style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;">${escapeHtml(String(fields.Description).substring(0, 300))}</p>` : ""}
      </div>
      ${isPurchase ? `<div class="ticket-info"><h3 style="color:#1e3a5f;margin:0 0 8px 0;">Purchase Request</h3>
        ${fields.PurchaseJustification ? `<p><span class="label">Justification:</span> ${escapeHtml(fields.PurchaseJustification)}</p>` : ""}
        <p style="color:#6b7280;font-size:13px;">For partial approval or to order directly, open the ticket in the app.</p></div>` : ""}
      <div class="actions">
        <a href="${approveUrl(tokens.approve, "approve")}" class="btn btn-approve">Approve</a>
        <a href="${approveUrl(tokens.deny, "deny")}" class="btn btn-deny">Deny</a>
        <a href="${approveUrl(tokens.changes, "changes")}" class="btn btn-changes">Request Changes</a>
      </div>
      <p style="text-align:center;color:#6b7280;font-size:14px;">
        Or <a href="${config.appUrl}/?ticket=${fields.id}" style="color:#1e3a5f;">open the full ticket</a>.</p>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

function decisionEmail(fields, ticketRef, decision, approverName, notes) {
  const badge = decision === "Approved" ? "badge-approved" : decision === "Denied" ? "badge-denied" : "badge-changes";
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Approval Decision</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p style="text-align:center;"><span class="badge ${badge}">${escapeHtml(decision)}</span></p>
      <p>${ticketRef} — <strong>${escapeHtml(fields.Title)}</strong></p>
      <div class="ticket-info">
        <p><span class="label">Decision by:</span> ${escapeHtml(approverName)}</p>
        ${notes ? `<p style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>` : ""}
      </div>
      <div class="actions"><a href="${config.appUrl}/?ticket=${fields.id}" class="btn btn-view">View Ticket</a></div>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

function purchaseApprovedEmail(fields, ticketRef, approverName) {
  return `<!DOCTYPE html><html><head><style>${styles}</style></head><body>
  <div class="container">
    <div class="header"><h1 style="margin:0;font-size:24px;">Purchase Request Approved</h1>
      <p style="margin:8px 0 0 0;opacity:.9;">SkyPark Help Desk</p></div>
    <div class="content">
      <p style="text-align:center;"><span class="badge badge-approved">Approved</span></p>
      <p>Approved by <strong>${escapeHtml(approverName)}</strong> — ready for ordering.</p>
      <div class="ticket-info"><h3 style="margin:0 0 8px 0;color:#1e3a5f;">${ticketRef}: ${escapeHtml(fields.Title)}</h3>
        ${fields.PurchaseJustification ? `<p><span class="label">Justification:</span> ${escapeHtml(fields.PurchaseJustification)}</p>` : ""}</div>
      <div class="actions"><a href="${config.appUrl}/?ticket=${fields.id}" class="btn btn-view">View Ticket</a></div>
    </div>
    <div class="footer"><p>This is an automated message from SkyPark Help Desk.</p></div>
  </div></body></html>`;
}

module.exports = { approvalRequestEmail, decisionEmail, purchaseApprovedEmail, escapeHtml };
```

- [ ] **Step 2: Commit**

```bash
git add azure-functions/src/lib/emailTemplates.js
git commit -m "feat: add server-side email templates for approvals"
```

---

## Phase 5 — `approvalAction` Function (GET summary + POST execute)

### Task 6: `approvalAction.js`

**Files:**
- Create: `azure-functions/src/functions/approvalAction.js`

- [ ] **Step 1: Implement** — `azure-functions/src/functions/approvalAction.js`:

```javascript
const { app } = require("@azure/functions");
const { verifyToken } = require("../lib/approvalToken");
const { actionToDecision, buildDecisionFields, isTerminalStatus } = require("../lib/decisionFields");
const { resolveDecisionRecipients } = require("../lib/approvalRecipients");
const { config, getGraphClient, sendMail, getGroupMemberEmails } = require("../lib/graphHelpers");
const { decisionEmail, purchaseApprovedEmail } = require("../lib/emailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getTicketFields(client, ticketId) {
  const item = await client
    .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticketId}?$expand=fields`)
    .get();
  const fields = item.fields || {};
  fields.id = item.id;
  // Requester email comes from the item creator (mirrors mapToTicket).
  fields.RequesterEmail = item.createdBy?.user?.email || "";
  // Capture the item ETag for optimistic-concurrency on the decision write.
  fields.__etag = item["@odata.etag"] || "*";
  return fields;
}

async function getCommenterEmails(client, ticketId) {
  try {
    const res = await client
      .api(`/sites/${config.siteId}/lists/${config.commentsListId}/items?$expand=fields&$filter=fields/TicketID eq ${ticketId}`)
      .get();
    return (res.value || []).map((i) => i.createdBy?.user?.email).filter(Boolean);
  } catch {
    return [];
  }
}

async function addInternalComment(client, ticketId, body) {
  await client.api(`/sites/${config.siteId}/lists/${config.commentsListId}/items`).post({
    fields: {
      Title: body.substring(0, 50) + (body.length > 50 ? "..." : ""),
      TicketID: Number(ticketId),
      Body: body,
      IsInternal: true,
    },
  });
}

async function logActivity(client, entry) {
  if (!config.activityLogListId) return;
  try {
    // Mirror the EXACT field schema written by src/lib/graphClient.ts logActivity:
    // Title (= description), EventType, Actor, and optional TicketId / TicketNumber /
    // ActorName / Details. The ActivityLog list has NO "Description" column — do not
    // write one (the earlier draft did, which SharePoint drops or rejects).
    const fields = {
      Title: entry.description,
      EventType: entry.eventType,
      Actor: entry.actor || "",
    };
    if (entry.ticketId) fields.TicketId = String(entry.ticketId);
    if (entry.ticketNumber) fields.TicketNumber = String(entry.ticketNumber);
    if (entry.actorName) fields.ActorName = entry.actorName;
    if (entry.details) fields.Details = entry.details;
    await client.api(`/sites/${config.siteId}/lists/${config.activityLogListId}/items`).post({ fields });
  } catch (e) {
    console.error("logActivity failed:", e.message);
  }
}

function ticketRefOf(fields) {
  return `Ticket #${fields.TicketNumber || fields.id}`;
}

app.http("approvalAction", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    // Token comes from query (GET) or body (POST)
    let token, note;
    if (request.method === "GET") {
      token = request.query.get("token");
    } else {
      const body = await request.json().catch(() => ({}));
      token = body.token;
      note = (body.note || "").trim();
    }

    const result = verifyToken(token);
    if (!result.valid) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: result.reason } };
    }
    const { tid, action, email: approverEmail, name: approverName } = result.payload;
    const decision = actionToDecision(action);
    if (!decision) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "bad_action" } };
    }

    try {
      const client = await getGraphClient();
      const fields = await getTicketFields(client, tid);
      const isPurchase = !!fields.IsPurchaseRequest;

      // ---- GET: side-effect-free summary (safe for mail-scanner prefetch) ----
      if (request.method === "GET") {
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: {
            ok: true,
            action,
            decision,
            approverName,
            ticket: {
              ref: ticketRefOf(fields),
              title: fields.Title,
              category: fields.Category,
              priority: fields.Priority,
              isPurchaseRequest: isPurchase,
              purchaseJustification: fields.PurchaseJustification || null,
              currentApprovalStatus: fields.ApprovalStatus || "Pending",
              decidedBy: fields.ApprovedByName || null,
              decidedDate: fields.ApprovalDate || null,
            },
            alreadyDecided: isTerminalStatus(fields.ApprovalStatus),
          },
        };
      }

      // ---- POST: execute ----
      if (action === "changes" && !note) {
        return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "note_required" } };
      }
      if (isTerminalStatus(fields.ApprovalStatus)) {
        return {
          status: 409,
          headers: corsHeaders,
          jsonBody: { ok: false, reason: "already_decided", decidedBy: fields.ApprovedByName, decidedDate: fields.ApprovalDate },
        };
      }

      const nowIso = new Date().toISOString();
      const patch = buildDecisionFields(decision, approverName, approverEmail, note || undefined, isPurchase, nowIso);

      // Optimistic concurrency: condition the write on the ETag we just read so two
      // near-simultaneous clicks can't both pass the terminal-status check above and
      // both write (the TOCTOU race). PATCH the item endpoint (not /fields) because
      // If-Match applies at the item level; this mirrors processApprovalDecision's
      // `client.api(itemEndpoint).patch({ fields })` shape.
      try {
        await client
          .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${tid}`)
          .header("If-Match", fields.__etag)
          .patch({ fields: patch });
      } catch (e) {
        if (e.statusCode === 412) {
          // Lost the race — re-read and report whoever won.
          const fresh = await getTicketFields(client, tid);
          if (isTerminalStatus(fresh.ApprovalStatus)) {
            return {
              status: 409,
              headers: corsHeaders,
              jsonBody: { ok: false, reason: "already_decided", decidedBy: fresh.ApprovedByName, decidedDate: fresh.ApprovalDate },
            };
          }
        }
        throw e;
      }

      // Verify the status saved (mirror of the in-app verify step)
      const verify = await getTicketFields(client, tid);
      if (verify.ApprovalStatus !== decision) {
        throw new Error(`Approval status failed to save (got "${verify.ApprovalStatus}")`);
      }

      // Internal decision comment (mirrors TicketDetail handleApprovalDecision)
      const noteText = note ? `📋 **${decision}** by ${approverName}\n\nNotes: ${note}` : `📋 **${decision}** by ${approverName}`;
      await addInternalComment(client, tid, noteText);

      await logActivity(client, {
        eventType: decision === "Approved" ? "approval_approved" : "approval_rejected",
        ticketId: tid,
        ticketNumber: verify.TicketNumber,
        actor: approverEmail,
        actorName: approverName,
        description: `Ticket ${decision.toLowerCase()} by ${approverName} (via email)`,
        details: JSON.stringify({ decision, notes: note || null, channel: "email" }),
      });

      // Decision emails -> participants (requester/assignee/approval-requester/participants/commenters, minus approver)
      const commenterEmails = await getCommenterEmails(client, tid);
      const recipients = resolveDecisionRecipients(verify, commenterEmails, approverEmail);
      const ref = ticketRefOf(verify);
      const subject = `[${decision}] ${ref}: ${verify.Title}`;
      const html = decisionEmail(verify, ref, decision, approverName, note || undefined);
      await Promise.all(recipients.map((to) =>
        sendMail(client, to, subject, html).catch((e) => console.error(`decision email to ${to} failed:`, e.message))
      ));

      // Purchase approval -> notify purchaser group (parity with in-app flow)
      if (isPurchase && decision === "Approved") {
        const purchasers = await getGroupMemberEmails(client, config.purchaserGroupId);
        const pSubject = `[Purchase Approved] ${ref}: ${verify.Title}`;
        const pHtml = purchaseApprovedEmail(verify, ref, approverName);
        await Promise.all(purchasers.map((to) =>
          sendMail(client, to, pSubject, pHtml).catch((e) => console.error(`purchaser email to ${to} failed:`, e.message))
        ));
      }

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, decision, ticketRef: ref } };
    } catch (error) {
      context.error("approvalAction failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
```

- [ ] **Step 2: Smoke-test locally.** Start the functions host and mint a token to exercise the endpoint.

```bash
cd azure-functions && npm install >/dev/null 2>&1; func start
```

In a second shell, mint a token for a real pending ticket id (replace `42`). Supply the
secret via a silent prompt so it never lands in a file-scrape, the command line, or shell
history (do NOT grep it out of `local.settings.json`):

```bash
cd azure-functions
read -rs -p "APPROVAL_LINK_SECRET: " SECRET; echo
TOKEN=$(APPROVAL_LINK_SECRET="$SECRET" node -e "console.log(require('./src/lib/approvalToken').signToken({tid:'42',action:'approve',email:'you@x.com',name:'You'}))")
unset SECRET
curl -s "http://localhost:7071/api/approvalaction?token=$TOKEN" | head -c 400
```

Expected: JSON `{"ok":true,"action":"approve",...,"ticket":{...}}`. (A `reason:"server_error"` here usually means missing local SharePoint env vars — fine to defer full execute-path testing to the deployed environment with a throwaway ticket.)

- [ ] **Step 3: Commit**

```bash
git add azure-functions/src/functions/approvalAction.js
git commit -m "feat: add approvalAction function (GET summary + POST execute)"
```

---

## Phase 6 — `sendApprovalRequest` Function + frontend trigger

### Task 7: `sendApprovalRequest.js`

**Files:**
- Create: `azure-functions/src/functions/sendApprovalRequest.js`

- [ ] **Step 1: Implement** — mint per-recipient tokens and send each approver their own email:

```javascript
const { app } = require("@azure/functions");
const { signToken } = require("../lib/approvalToken");
const { config, getGraphClient, sendMail, getGroupMembers } = require("../lib/graphHelpers");
const { approvalRequestEmail } = require("../lib/emailTemplates");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.http("sendApprovalRequest", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders };

    const { ticketId, requesterName } = await request.json().catch(() => ({}));
    if (!ticketId) {
      return { status: 400, headers: corsHeaders, jsonBody: { ok: false, reason: "missing_ticketId" } };
    }

    try {
      const client = await getGraphClient();
      const item = await client
        .api(`/sites/${config.siteId}/lists/${config.ticketsListId}/items/${ticketId}?$expand=fields`)
        .get();
      const fields = item.fields || {};
      fields.id = item.id;
      const ref = `Ticket #${fields.TicketNumber || item.id}`;
      // Derive the requester name from SharePoint, not the (untrusted) browser param.
      const who = fields.ApprovalRequestedByName || requesterName || "A staff member";

      // SECURITY GATE: this endpoint is anonymous, so only mint + send tokens when the
      // ticket is genuinely Pending approval. This blocks an anonymous caller from
      // spamming GMs with approval emails for arbitrary or already-decided tickets.
      // (Per design decision: pending-state gate rather than full bearer validation.)
      if (fields.ApprovalStatus !== "Pending") {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "not_pending" } };
      }

      const approvers = await getGroupMembers(client, config.generalManagersGroupId);
      if (approvers.length === 0) {
        return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent: 0, note: "no approvers" } };
      }

      const subject = `[Approval Required] ${ref}: ${fields.Title}`;
      let sent = 0;
      await Promise.all(approvers.map(async ({ email, displayName }) => {
        const name = displayName || email; // attribute the decision to a real name when available
        const tokens = {
          approve: signToken({ tid: String(item.id), action: "approve", email, name }),
          deny: signToken({ tid: String(item.id), action: "deny", email, name }),
          changes: signToken({ tid: String(item.id), action: "changes", email, name }),
        };
        const html = approvalRequestEmail(fields, ref, who, tokens);
        try { await sendMail(client, email, subject, html); sent++; }
        catch (e) { context.error(`approval email to ${email} failed:`, e.message); }
      }));

      return { status: 200, headers: corsHeaders, jsonBody: { ok: true, sent } };
    } catch (error) {
      context.error("sendApprovalRequest failed:", error);
      return { status: 500, headers: corsHeaders, jsonBody: { ok: false, reason: "server_error", details: error.message } };
    }
  },
});
```

> The token's `name` is the approver's **display name** (from `getGroupMembers`), so the recorded decision attributes to a real name rather than an email. Tokens are minted only for genuinely-pending tickets and are emailed to each GM individually — never returned to the HTTP caller.

- [ ] **Step 2: Commit**

```bash
git add azure-functions/src/functions/sendApprovalRequest.js
git commit -m "feat: add sendApprovalRequest function with per-recipient signed tokens"
```

### Task 8: Point the frontend at `sendApprovalRequest`

Today `TicketDetail.tsx` calls `sendApprovalRequestEmail(client, ticket, requesterName)` (emailService.ts), which builds the email in the browser. Replace that call with a fetch to the new function. Keep `sendApprovalRequestEmail` exported but unused for now (removed in a later cleanup).

**Files:**
- Modify: `src/lib/graphClient.ts` (add `triggerApprovalRequestEmail`)
- Modify: `src/components/TicketDetail.tsx` (call site)

- [ ] **Step 1: Add the trigger to `graphClient.ts`.** Near the `EMAIL_FUNCTION_URL` constant (line 718), add:

```typescript
// Azure Function that builds + sends the approval-request email with signed action links.
const SEND_APPROVAL_REQUEST_URL = process.env.NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL || "";

// Ask the server to send the signed approval-request email to the GM group.
// Falls back silently (returns false) if the URL isn't configured.
export async function triggerApprovalRequestEmail(
  ticketId: string,
  requesterName: string
): Promise<boolean> {
  if (!SEND_APPROVAL_REQUEST_URL) {
    console.warn("[triggerApprovalRequestEmail] NEXT_PUBLIC_SEND_APPROVAL_REQUEST_URL not set");
    return false;
  }
  try {
    const res = await fetch(SEND_APPROVAL_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, requesterName }),
    });
    return res.ok;
  } catch (e) {
    console.error("[triggerApprovalRequestEmail] failed:", e);
    return false;
  }
}
```

- [ ] **Step 2: Find the call site in `TicketDetail.tsx`.**

Run: `grep -n "sendApprovalRequestEmail" src/components/TicketDetail.tsx`
Expected: a call inside the request-approval handler (around the block that ends at line 424).

- [ ] **Step 3: Replace the call.** Swap the `sendApprovalRequestEmail(client, ticket, requesterName)` invocation for:

```typescript
      // Build + send the signed approval-request email server-side (links carry HMAC tokens)
      triggerApprovalRequestEmail(ticket.id, requesterName)
        .catch((e) => console.error("Failed to trigger approval request email:", e));
```

Update the import on line 20-28 to add `triggerApprovalRequestEmail` from `@/lib/graphClient` and remove `sendApprovalRequestEmail` from the `@/lib/emailService` import if it is now unused (verify with grep first).

- [ ] **Step 4: Type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors related to these files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graphClient.ts src/components/TicketDetail.tsx
git commit -m "feat: trigger signed approval emails via sendApprovalRequest function"
```

---

## Phase 7 — `/approve` confirmation page + layout guard

### Task 9: Guard the layout so `/approve` is never redirected

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add a public-route guard.** In the `useEffect` of `RootLayout` (layout.tsx), before `validateCachedSession` is defined/used, compute a flag and use it to skip the redirect. Change the cached-account branch (lines 88-93) so it does not run `validateCachedSession` on `/approve`:

```typescript
        // No redirect response, check for existing accounts
        const accounts = msalInstance.getAllAccounts();
        // /approve is a public, token-authorized page. Skip ALL auth bootstrapping
        // for it: no cached-session validation (which redirects and would drop the
        // ?token= from the URL) AND no Teams SSO. The page authorizes via its token.
        const isPublicActionPage =
          typeof window !== "undefined" && window.location.pathname.startsWith("/approve");
        if (isPublicActionPage) {
          if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);
          // intentionally no validateCachedSession and no ssoSilent — fall through
        } else if (accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0]);
          setAuthenticatedUser(accounts[0].username, accounts[0].name ?? undefined);
          // Fire-and-forget so app startup isn't blocked on a token round-trip
          validateCachedSession(accounts[0], teamsAuth.isTeams);
        } else if (teamsAuth.isTeams && teamsAuth.loginHint) {
```

(The rest of the `else if` block is unchanged.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "fix: never redirect the /approve public action page through login"
```

### Task 10: The `/approve` page

**Files:**
- Create: `src/app/approve/page.tsx`

- [ ] **Step 1: Implement** — a client page that reads `action` + `token` from the URL, fetches the summary (GET), shows the card with an optional note, and submits (POST). No MSAL/RBAC usage.

```tsx
"use client";

import { useEffect, useState } from "react";

const ACTION_URL = process.env.NEXT_PUBLIC_APPROVAL_ACTION_URL || "";

type Summary = {
  ok: boolean;
  action: "approve" | "deny" | "changes";
  decision: string;
  approverName: string;
  ticket: {
    ref: string;
    title: string;
    category: string;
    priority: string;
    isPurchaseRequest: boolean;
    purchaseJustification: string | null;
    currentApprovalStatus: string;
    decidedBy: string | null;
    decidedDate: string | null;
  };
  alreadyDecided: boolean;
};

const ACTION_LABEL: Record<string, string> = {
  approve: "Approve",
  deny: "Deny",
  changes: "Request Changes",
};

export default function ApprovePage() {
  const [token, setToken] = useState<string | null>(null);
  const [action, setAction] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const a = params.get("action") || "";
    setToken(t);
    setAction(a);
    if (!t || !ACTION_URL) {
      setError("This link is missing its security token.");
      return;
    }
    fetch(`${ACTION_URL}?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data: Summary & { reason?: string }) => {
        if (!data.ok) {
          setError(
            data.reason === "expired" ? "This approval link has expired."
            : data.reason === "bad_signature" || data.reason === "malformed" ? "This approval link isn't valid."
            : "Unable to load this approval."
          );
          return;
        }
        setSummary(data);
      })
      .catch(() => setError("Unable to reach the approval service. Please try again."));
  }, []);

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.reason === "already_decided") {
          setError(`This was already decided${data.decidedBy ? ` by ${data.decidedBy}` : ""}.`);
        } else if (data.reason === "note_required") {
          setError("Please add a message describing the changes needed.");
        } else {
          setError("Could not record your decision. Please try again or open the ticket.");
        }
        return;
      }
      setDone(data.decision);
    } catch {
      setError("Could not record your decision. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const card = "max-w-md w-full bg-white rounded-2xl shadow-lg p-8";
  const wrap = "min-h-screen flex items-center justify-center bg-slate-100 p-4";

  if (done) {
    return (
      <div className={wrap}><div className={card}>
        <h1 className="text-2xl font-semibold text-emerald-600">✓ {done}</h1>
        <p className="mt-2 text-slate-600">Your decision has been recorded. You can close this tab.</p>
      </div></div>
    );
  }

  if (error && !summary) {
    return (
      <div className={wrap}><div className={card}>
        <h1 className="text-xl font-semibold text-slate-800">Approval link</h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <a href="https://tickets.spsvent.net" className="mt-4 inline-block text-brand-primary underline">Open the Help Desk</a>
      </div></div>
    );
  }

  if (!summary) {
    return <div className={wrap}><div className={card}><p className="text-slate-500">Loading…</p></div></div>;
  }

  const requiresNote = summary.action === "changes";

  return (
    <div className={wrap}><div className={card}>
      <h1 className="text-2xl font-semibold text-slate-800">
        {ACTION_LABEL[summary.action]} {summary.ticket.ref}?
      </h1>
      <p className="mt-1 text-slate-600">{summary.ticket.title}</p>

      {summary.alreadyDecided && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          This was already {summary.ticket.currentApprovalStatus.toLowerCase()}
          {summary.ticket.decidedBy ? ` by ${summary.ticket.decidedBy}` : ""}.
        </p>
      )}

      {summary.ticket.isPurchaseRequest && summary.ticket.purchaseJustification && (
        <p className="mt-3 text-sm text-slate-500">
          <span className="font-medium text-slate-700">Justification:</span> {summary.ticket.purchaseJustification}
        </p>
      )}

      <label className="mt-5 block text-sm font-medium text-slate-700">
        {requiresNote ? "Describe the changes needed (required)" : "Optional message to the team"}
      </label>
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={requiresNote ? "e.g. Please get the 2-year warranty version" : "Add a note (optional)"}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || summary.alreadyDecided || (requiresNote && !note.trim())}
        className="mt-5 w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Recording…" : `Confirm ${ACTION_LABEL[summary.action]}`}
      </button>
    </div></div>
  );
}
```

- [ ] **Step 2: Build the static export to confirm the route compiles**

Run: `npm run build`
Expected: build succeeds and `out/approve/index.html` is produced. Verify:

Run: `ls out/approve/index.html`
Expected: the file exists.

- [ ] **Step 3: Commit**

```bash
git add src/app/approve/page.tsx
git commit -m "feat: add no-login /approve confirmation page"
```

---

## Phase 8 — Deploy, end-to-end verify, help docs

### Task 11: Deploy functions and verify the full path

- [ ] **Step 1: Deploy the functions**

```bash
cd azure-functions && func azure functionapp publish helpdesk-notify-func
```

Expected: the published function list includes `approvalAction` and `sendApprovalRequest` (alongside the existing ones).

- [ ] **Step 2: Confirm `APPROVAL_LINK_SECRET` is set in the Function App** (Task 0). Without it the functions throw on first token op.

- [ ] **Step 3: Deploy the frontend** — push the branch and merge to `main` (Azure Static Web Apps builds on push to `main`). The new `NEXT_PUBLIC_*` URLs (Task 0 Step 3) bake in at build time.

- [ ] **Step 4: End-to-end test with a throwaway ticket.** Create a test Request ticket, request approval, and confirm the GM receives the new email. Tap **Approve** → land on `https://tickets.spsvent.net/approve/?...` (no login) → confirm with a note → verify: ticket `ApprovalStatus = Approved`, an internal decision comment exists, the activity log shows `approval_approved` with `channel:"email"`, and the requester received a decision email. Re-tap the same link → page shows "already decided."

- [ ] **Step 5: Test Request Changes requires a note** — tap Request Changes, confirm the button stays disabled until the note is filled, then submit and verify `ApprovalStatus = Changes Requested` and the Approve link still works afterward (non-terminal).

### Task 12: Update help documentation (required by project conventions)

**Files:**
- Modify: `src/app/help/page.tsx`

- [ ] **Step 1: Add an "Approving by email" section.** Locate the `helpSections` array:

Run: `grep -n "helpSections\|id: \"" src/app/help/page.tsx | head -40`

- [ ] **Step 2: Insert a new section object** following the existing structure:

```tsx
{
  id: "approving-by-email",
  title: "Approving by Email",
  content: (
    <div className="space-y-4">
      <p>Approval-request emails now include <strong>Approve</strong>, <strong>Deny</strong>, and <strong>Request Changes</strong> buttons.</p>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Tap a button in the email. A secure confirmation page opens — no sign-in required.</li>
        <li>Optionally add a message to the team (required for <em>Request Changes</em>).</li>
        <li>Tap <strong>Confirm</strong>. Your decision is recorded and everyone on the ticket is notified.</li>
      </ol>
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
        <strong>Tip:</strong> Links are personal and expire after 14 days. Once a ticket is approved or denied, the link shows that it was already decided.
      </div>
      <p className="text-sm text-text-secondary">Partial approvals and ordering directly still happen inside the app — those buttons link you to the ticket.</p>
    </div>
  ),
},
```

- [ ] **Step 3: Verify the help page renders**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/help/page.tsx
git commit -m "docs: add Approving by Email help section"
```

---

## Post-Codex-Review Revisions (2026-06-17)

This plan was revised after an adversarial Codex review. Changes from the original draft:
- **Pending-state gate** on `sendApprovalRequest` (Task 7) — anonymous callers can't mint/send tokens for non-pending tickets. (Per decision: gate rather than full bearer validation.)
- **ETag `If-Match` optimistic concurrency** on the decision PATCH (Task 6) — closes the double-click / approve-vs-deny TOCTOU race.
- **Activity-log schema** (Task 6) now mirrors `src/lib/graphClient.ts` exactly (no `Description` column; includes `TicketNumber`).
- **`displayName` attribution** via new `getGroupMembers` helper (Tasks 4,7) instead of email-as-name.
- **Layout guard** (Task 9) skips ALL auth/SSO bootstrapping for `/approve`, not just the cached-session redirect.
- **Secret hygiene** (Task 6) — the local token-mint no longer scrapes `local.settings.json`.
- **Attribution parity (accepted limitation):** the server writes the text fallbacks `ApprovedByName`/`ApprovedByEmail` (which the UI reads as the source of truth) but does NOT replicate the in-app best-effort `ApprovedByLookupId` Person-field patch — text-only attribution is accepted by design (the in-app Person patch is itself non-blocking).

## Self-Review Checklist (completed during planning)

- **Spec coverage:** Approve/Deny/Request-Changes (Tasks 2,6,10) ✓; purchase one-tap (Task 6 purchase branch) ✓; inline note in one POST (Tasks 6,10) ✓; branded /approve page (Tasks 9,10) ✓; per-recipient signed tokens (Task 7) ✓; server-side execution mirroring processApprovalDecision (Tasks 2,6) ✓; mail-scanner-safe GET (Task 6) ✓; 14-day expiry + terminal-state lock + non-terminal Request-Changes (Tasks 1,2,6) ✓; help docs (Task 12) ✓.
- **Decision-email recipients** use a server resolver that already understands Piece C's `ParticipantEmails` column, so Piece A degrades gracefully before/after Piece C ships.
- **Type/name consistency:** `signToken`/`verifyToken`, `actionToDecision`/`buildDecisionFields`/`isTerminalStatus`, `resolveDecisionRecipients`, `getGraphClient`/`sendMail`/`getGroupMemberEmails`, `approvalRequestEmail`/`decisionEmail`/`purchaseApprovedEmail`, `triggerApprovalRequestEmail` — used consistently across tasks.
- **Out of scope (Piece C / follow-ups):** participant UI, comment-notification expansion, status-change emails, inbound email, popup reduction.
