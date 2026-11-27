#!/usr/bin/env node
// =============================================================================
// Provision the Quick Fix Log SharePoint lists (src/modules/fixlog/).
// =============================================================================
// Dependency-free (Node 18+ fetch). Idempotent: existing lists/columns are reused,
// and starter issues are only seeded into an EMPTY QuickFixIssues list.
//
//   QuickFixLog     Title, Location, IssueId, Category, Device, Notes (plain),
//                   FixedAt (dateTime, indexed), StationStaffName, StationStaffEmail,
//                   LoggedByName, LoggedByEmail, Department, PhotoCount.
//                   Photos = the item's attachments (on by default).
//   QuickFixIssues  Title, Category, SortOrder, Active, Department.
//
// Step 1 — create + seed (Graph; app-only token with Sites.ReadWrite.All):
//   GRAPH_TOKEN=... SITE_ID=... node scripts/provision-fixlog-lists.mjs
//   Prints both list ids → NEXT_PUBLIC_FIXLOG_LIST_ID / NEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID
//   in .github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml.
//
// Step 2 — lock both lists to IT + admins (SharePoint REST; needs a DELEGATED
// SharePoint token for a site owner — SharePoint rejects app-only secret tokens):
//   SP_TOKEN=... SITE_URL=https://skyparksv.sharepoint.com/sites/helpdesk \
//   LIST_IDS=<log id>,<issues id> EDIT_CLAIMS='c:0t.c|tenant|<group id>,...' \
//   node scripts/provision-fixlog-lists.mjs --lock
//   Breaks permission inheritance on each list (no copy), then grants Edit to each
//   claim and keeps Full Control for the site's Owners group. Security groups use
//   "c:0t.c|tenant|<id>"; Microsoft 365 groups use
//   "c:0o.c|federateddirectoryclaimprovider|<id>".
// =============================================================================

import { readFileSync } from "node:fs";

const GRAPH = "https://graph.microsoft.com/v1.0";
const args = new Set(process.argv.slice(2));

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}`);
    process.exit(2);
  }
  return v;
}

async function call(url, token, init = {}, accept = "application/json") {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      ...(init.body ? { "Content-Type": accept } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${init.method || "GET"} ${url} → ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// --- Step 1: lists ---------------------------------------------------------------

const TEXT = (name) => ({ name, text: { allowMultipleLines: false, maxLength: 255 } });

const LOG_COLUMNS = [
  TEXT("Location"),
  TEXT("IssueId"),
  TEXT("Category"),
  TEXT("Device"),
  { name: "Notes", text: { allowMultipleLines: true, textType: "plain" } },
  { name: "FixedAt", indexed: true, dateTime: { format: "dateTime", displayAs: "default" } },
  TEXT("StationStaffName"),
  TEXT("StationStaffEmail"),
  TEXT("LoggedByName"),
  TEXT("LoggedByEmail"),
  TEXT("Department"),
  { name: "PhotoCount", number: {} },
];

const ISSUE_COLUMNS = [
  TEXT("Category"),
  { name: "SortOrder", number: {} },
  { name: "Active", boolean: {} },
  TEXT("Department"),
];

async function ensureList(token, siteId, displayName, description, columns) {
  const found = await call(
    `${GRAPH}/sites/${siteId}/lists?$filter=${encodeURIComponent(`displayName eq '${displayName}'`)}`,
    token
  );
  let listId = found.value?.[0]?.id;
  if (listId) {
    console.log(`= ${displayName} exists (${listId})`);
  } else {
    const created = await call(`${GRAPH}/sites/${siteId}/lists`, token, {
      method: "POST",
      body: JSON.stringify({ displayName, description, list: { template: "genericList" } }),
    });
    listId = created.id;
    console.log(`+ created ${displayName} (${listId})`);
  }
  const existing = await call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns?$select=name,indexed`, token);
  const have = new Map(existing.value.map((c) => [c.name, c]));
  for (const col of columns) {
    if (have.has(col.name)) {
      if (col.indexed && !have.get(col.name).indexed) {
        await call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns/${col.name}`, token, {
          method: "PATCH",
          body: JSON.stringify({ indexed: true }),
        }).catch((e) => console.warn(`! could not index ${col.name}: ${e.message}`));
      }
      continue;
    }
    await call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns`, token, {
      method: "POST",
      body: JSON.stringify(col),
    });
    console.log(`  + column ${col.name}`);
  }
  return listId;
}

async function seedIssues(token, siteId, listId) {
  const items = await call(`${GRAPH}/sites/${siteId}/lists/${listId}/items?$top=1`, token);
  if (items.value?.length) {
    console.log("= QuickFixIssues already has items; not seeding");
    return;
  }
  const seed = JSON.parse(readFileSync(new URL("./fixlog-starter-issues.json", import.meta.url), "utf8"));
  let order = 10;
  for (const s of seed) {
    await call(`${GRAPH}/sites/${siteId}/lists/${listId}/items`, token, {
      method: "POST",
      body: JSON.stringify({
        fields: { Title: s.label, Category: s.category || "", SortOrder: order, Active: true, Department: "Tech" },
      }),
    });
    order += 10;
  }
  console.log(`  + seeded ${seed.length} starter issues`);
}

async function provision() {
  const token = need("GRAPH_TOKEN");
  const siteId = need("SITE_ID");
  const logId = await ensureList(
    token,
    siteId,
    "QuickFixLog",
    "IT fixes made without a ticket (Help Desk Quick Fix Log). Photos 90 days, station-staff name 12 months, entries 3 years.",
    LOG_COLUMNS
  );
  const issuesId = await ensureList(
    token,
    siteId,
    "QuickFixIssues",
    "Common-issue quick-pick buttons for the Help Desk Quick Fix Log.",
    ISSUE_COLUMNS
  );
  await seedIssues(token, siteId, issuesId);
  console.log(`\nNEXT_PUBLIC_FIXLOG_LIST_ID=${logId}\nNEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID=${issuesId}`);
}

// --- Step 2: lock ----------------------------------------------------------------

const ROLE_EDIT = 1073741830; // SharePoint built-in "Edit"
const ROLE_FULL = 1073741829; // SharePoint built-in "Full Control"
const V = "application/json;odata=verbose";

async function lock() {
  const token = need("SP_TOKEN");
  const site = need("SITE_URL").replace(/\/$/, "");
  const listIds = need("LIST_IDS").split(",").map((s) => s.trim()).filter(Boolean);
  const claims = need("EDIT_CLAIMS").split(",").map((s) => s.trim()).filter(Boolean);

  const owners = await call(`${site}/_api/web/associatedownergroup?$select=Id,Title`, token, {}, V);
  const principals = [];
  for (const logonName of claims) {
    const u = await call(`${site}/_api/web/ensureuser`, token, {
      method: "POST",
      body: JSON.stringify({ logonName }),
    }, V);
    principals.push({ id: u.d.Id, title: u.d.Title });
  }

  for (const listId of listIds) {
    const list = `${site}/_api/web/lists(guid'${listId}')`;
    await call(`${list}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`, token, { method: "POST" }, V);
    await call(`${list}/roleassignments/addroleassignment(principalid=${owners.d.Id},roledefid=${ROLE_FULL})`, token, { method: "POST" }, V);
    for (const p of principals) {
      await call(`${list}/roleassignments/addroleassignment(principalid=${p.id},roledefid=${ROLE_EDIT})`, token, { method: "POST" }, V);
    }
    const ra = await call(`${list}/roleassignments?$expand=Member,RoleDefinitionBindings`, token, {}, V);
    console.log(`\n${listId} now grants:`);
    for (const r of ra.d.results) {
      console.log(`  ${r.Member.Title} → ${r.RoleDefinitionBindings.results.map((b) => b.Name).join(", ")}`);
    }
  }
}

(args.has("--lock") ? lock() : provision()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
