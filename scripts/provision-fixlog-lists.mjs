#!/usr/bin/env node
// =============================================================================
// Provision the Quick Fix Log SharePoint lists (src/modules/fixlog/).
// =============================================================================
// Dependency-free (Node 18+ fetch). Idempotent: existing lists/columns are reused.
// Starter issues are seeded when QuickFixIssues is created; pass --seed-missing to
// add any starter labels that aren't there (e.g. after an interrupted first run) —
// it never touches existing rows, so retired issues stay retired.
//
//   QuickFixLog     Title, Location, IssueId, Category, Device, Notes (plain),
//                   FixedAt (dateTime, indexed), StationStaffName, StationStaffEmail,
//                   LoggedByName, LoggedByEmail, Department, PhotoCount.
//                   Photos = the item's attachments (on by default).
//   QuickFixIssues  Title, Category, SortOrder, Active, Department.
//
// Step 1 — create + seed (Graph token that can create lists/columns on the site,
// e.g. the Help Desk app's app-only token with Sites.ReadWrite.All):
//   GRAPH_TOKEN=... SITE_ID=... node scripts/provision-fixlog-lists.mjs [--seed-missing]
//   Prints both list ids → NEXT_PUBLIC_FIXLOG_LIST_ID / NEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID
//   in .github/workflows/azure-static-web-apps-lively-coast-062dfc51e.yml.
//
// Step 2 — lock both lists to IT + admins (SharePoint REST; needs a DELEGATED
// SharePoint token for a site owner — SharePoint rejects app-only secret tokens):
//   SP_TOKEN=... SITE_URL=https://skyparksv.sharepoint.com/sites/helpdesk \
//   LOG_LIST_ID=<QuickFixLog id> ISSUES_LIST_ID=<QuickFixIssues id> \
//   ADMIN_CLAIMS='<claim>,...' TECH_CLAIMS='<claim>,...' \
//   node scripts/provision-fixlog-lists.mjs --lock
//
//   Resulting access on BOTH lists, verified exactly at the end (exit 1 if not):
//     site Owners group  Full Control
//     ADMIN_CLAIMS       Edit        (GMs: can edit/delete anyone's entry — cleanup)
//     TECH_CLAIMS        Contribute  (IT: add + edit)
//   plus, on QuickFixLog only: item-level "edit only items you created"
//   (WriteSecurity=2 — Contribute can't bypass it, Edit/Full Control can) and
//   version history OFF, so a cleared station-staff name doesn't live on in old
//   versions. Any other list-level assignment is removed, and any item with its own
//   (unique) permissions is reset to inherit from the list.
//   The caller must be a site collection admin or a member of the site's Owners
//   group (so they can never lock themselves out); otherwise nothing is changed.
//   Claims: security group "c:0t.c|tenant|<id>"; Microsoft 365 group members
//   "c:0o.c|federateddirectoryclaimprovider|<id>". Safe to re-run.
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
  let created = false;
  if (listId) {
    console.log(`= ${displayName} exists (${listId})`);
  } else {
    created = true;
    const res = await call(`${GRAPH}/sites/${siteId}/lists`, token, {
      method: "POST",
      body: JSON.stringify({ displayName, description, list: { template: "genericList" } }),
    });
    listId = res.id;
    console.log(`+ created ${displayName} (${listId})`);
  }
  const cols = () => call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns?$select=id,name,indexed`, token);
  const have = new Map((await cols()).value.map((c) => [c.name, c]));
  for (const col of columns) {
    const cur = have.get(col.name);
    if (!cur) {
      await call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns`, token, {
        method: "POST",
        body: JSON.stringify(col),
      });
      console.log(`  + column ${col.name}`);
    } else if (col.indexed && !cur.indexed) {
      await call(`${GRAPH}/sites/${siteId}/lists/${listId}/columns/${cur.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ indexed: true }),
      });
      console.log(`  ~ indexed ${col.name}`);
    }
  }
  // Verify every column exists and every index really took.
  const after = new Map((await cols()).value.map((c) => [c.name, c]));
  for (const col of columns) {
    if (!after.has(col.name)) throw new Error(`${displayName}: column ${col.name} missing after provisioning`);
    if (col.indexed && !after.get(col.name).indexed)
      throw new Error(`${displayName}: column ${col.name} is not indexed`);
  }
  return { listId, created };
}

// Adds starter labels that are missing (compared against ALL rows, retired ones
// included), keeping each starter's place in the order. Never edits existing rows.
async function seedIssues(token, siteId, listId) {
  const have = new Set();
  let url = `${GRAPH}/sites/${siteId}/lists/${listId}/items?$expand=fields($select=Title)&$top=500`;
  while (url) {
    const page = await call(url, token);
    for (const it of page.value || []) have.add(String(it.fields?.Title || "").trim().toLowerCase());
    url = page["@odata.nextLink"];
  }
  const seed = JSON.parse(readFileSync(new URL("./fixlog-starter-issues.json", import.meta.url), "utf8"));
  let added = 0;
  for (const [i, s] of seed.entries()) {
    if (have.has(s.label.trim().toLowerCase())) continue;
    await call(`${GRAPH}/sites/${siteId}/lists/${listId}/items`, token, {
      method: "POST",
      body: JSON.stringify({
        fields: { Title: s.label, Category: s.category || "", SortOrder: (i + 1) * 10, Active: true, Department: "Tech" },
      }),
    });
    added++;
  }
  console.log(`  + seeded ${added} starter issue(s) (${seed.length - added} already present)`);
}

async function provision() {
  const token = need("GRAPH_TOKEN");
  const siteId = need("SITE_ID");
  const { listId: logId } = await ensureList(
    token,
    siteId,
    "QuickFixLog",
    "IT fixes made without a ticket (Help Desk Quick Fix Log). Photos 90 days, station-staff name 12 months, entries 3 years.",
    LOG_COLUMNS
  );
  const { listId: issuesId, created: issuesCreated } = await ensureList(
    token,
    siteId,
    "QuickFixIssues",
    "Common-issue quick-pick buttons for the Help Desk Quick Fix Log.",
    ISSUE_COLUMNS
  );
  if (issuesCreated || args.has("--seed-missing")) await seedIssues(token, siteId, issuesId);
  else console.log("= QuickFixIssues already existed; not seeding (use --seed-missing to add absent starters)");
  console.log(`\nNEXT_PUBLIC_FIXLOG_LIST_ID=${logId}\nNEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID=${issuesId}`);
}

// --- Step 2: lock ----------------------------------------------------------------

const ROLE_FULL = 1073741829; // SharePoint built-in "Full Control"
const ROLE_EDIT = 1073741830; // "Edit" (includes Manage Lists → bypasses item-level rules)
const ROLE_CONTRIBUTE = 1073741827; // "Contribute"
const KIND_LIMITED = 1; // RoleTypeKind "Guest" = the system-managed "Limited Access" (locale-independent)
const V = "application/json;odata=verbose";

const claimsFrom = (name) => need(name).split(",").map((s) => s.trim()).filter(Boolean);

async function lock() {
  const token = need("SP_TOKEN");
  const site = need("SITE_URL").replace(/\/$/, "");
  const logId = need("LOG_LIST_ID");
  const issuesId = need("ISSUES_LIST_ID");
  const adminClaims = claimsFrom("ADMIN_CLAIMS");
  const techClaims = claimsFrom("TECH_CLAIMS");
  if (!adminClaims.length || !techClaims.length) throw new Error("ADMIN_CLAIMS and TECH_CLAIMS must both be non-empty");
  if (logId === issuesId) throw new Error("LOG_LIST_ID and ISSUES_LIST_ID must differ");
  const sp = (path, init) => call(`${site}/_api/${path}`, token, init, V);
  // Collection reads follow odata=verbose paging (d.__next) to the end.
  const spAll = async (path) => {
    const out = [];
    let url = `${site}/_api/${path}`;
    while (url) {
      const r = await call(url, token, {}, V);
      out.push(...(r.d.results || []));
      url = r.d.__next;
    }
    return out;
  };
  const roleAssignments = (base) => spAll(`${base}/roleassignments?$expand=Member,RoleDefinitionBindings`);

  // ---- preflight: everything resolvable BEFORE any permission change ----------
  const me = (await sp("web/currentuser?$select=Id,Title,IsSiteAdmin")).d;
  const owners = (await sp("web/associatedownergroup?$select=Id,Title")).d;
  const ownerIds = new Set((await spAll(`web/sitegroups(${owners.Id})/users?$select=Id`)).map((u) => u.Id));
  // The caller keeps access through the site, not through anything this script
  // touches — so removing every other list grant can never lock them out.
  if (!me.IsSiteAdmin && !ownerIds.has(me.Id))
    throw new Error(`${me.Title} is neither a site collection admin nor in "${owners.Title}" — refusing to change permissions`);
  for (const id of [ROLE_FULL, ROLE_EDIT, ROLE_CONTRIBUTE]) await sp(`web/roledefinitions(${id})?$select=Name`);
  const ensure = async (logonName) => {
    const u = (await sp("web/ensureuser", { method: "POST", body: JSON.stringify({ logonName }) })).d;
    if (!u?.Id) throw new Error(`Could not resolve ${logonName}`);
    return { id: u.Id, title: u.Title };
  };
  const admins = [];
  for (const c of adminClaims) admins.push(await ensure(c));
  const techs = [];
  for (const c of techClaims) techs.push(await ensure(c));
  const lists = [];
  for (const [id, label] of [[logId, "QuickFixLog"], [issuesId, "QuickFixIssues"]]) {
    const l = (await sp(`web/lists(guid'${id}')?$select=Title,HasUniqueRoleAssignments`)).d;
    if (l.Title !== label) throw new Error(`List ${id} is "${l.Title}", expected "${label}"`);
    lists.push({ id, title: l.Title, unique: l.HasUniqueRoleAssignments });
  }

  // Expected principal → role id. A principal named twice keeps the stronger role.
  const expected = new Map([[owners.Id, ROLE_FULL]]);
  for (const p of techs) if (!expected.has(p.id)) expected.set(p.id, ROLE_CONTRIBUTE);
  for (const p of admins) if (expected.get(p.id) !== ROLE_FULL) expected.set(p.id, ROLE_EDIT);
  console.log(`Caller: ${me.Title} (site admin: ${me.IsSiteAdmin}, in Owners: ${ownerIds.has(me.Id)})`);
  console.log(`Owners: ${owners.Title} → Full Control`);
  for (const p of admins) console.log(`Admin:  ${p.title} → Edit`);
  for (const p of techs) console.log(`IT:     ${p.title} → Contribute`);

  for (const l of lists) {
    const base = `web/lists(guid'${l.id}')`;
    console.log(`\n${l.title} (${l.id})`);
    // Only break once. On a re-run the list is already unique and is reconciled below.
    if (!l.unique) {
      await sp(`${base}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`, { method: "POST" });
      console.log("  broke inheritance (no copy)");
    }
    // Grants first (Owners before anyone else), removals after — never a moment
    // with Owners missing.
    for (const [pid, role] of expected) {
      await sp(`${base}/roleassignments/addroleassignment(principalid=${pid},roledefid=${role})`, { method: "POST" });
    }
    // Items shared on their own (unique permissions) would keep access the list
    // no longer grants — reset every such item to inherit from the list.
    const items = await spAll(`${base}/items?$select=Id,HasUniqueRoleAssignments&$top=5000`);
    for (const it of items.filter((i) => i.HasUniqueRoleAssignments)) {
      await sp(`${base}/items(${it.Id})/resetroleinheritance`, { method: "POST" });
      console.log(`  ~ item ${it.Id} reset to inherit list permissions`);
    }
    for (const r of await roleAssignments(base)) {
      const pid = r.PrincipalId;
      const want = expected.get(pid);
      for (const b of r.RoleDefinitionBindings.results) {
        if (b.Id === want) continue;
        if (b.RoleTypeKind === KIND_LIMITED) continue; // system-managed; checked via items above
        await sp(`${base}/roleassignments/removeroleassignment(principalid=${pid},roledefid=${b.Id})`, { method: "POST" });
        console.log(`  - removed ${r.Member.Title} ${b.Name}`);
      }
    }
    if (l.id === logId) {
      await sp(base, {
        method: "POST",
        headers: { "X-HTTP-Method": "MERGE", "IF-MATCH": "*" },
        body: JSON.stringify({ __metadata: { type: "SP.List" }, WriteSecurity: 2, EnableVersioning: false }),
      });
    }

    // ---- verify exactly -------------------------------------------------------
    const problems = [];
    const seen = new Set();
    for (const r of await roleAssignments(base)) {
      const roles = r.RoleDefinitionBindings.results.filter((b) => b.RoleTypeKind !== KIND_LIMITED).map((b) => b.Id);
      const want = expected.get(r.PrincipalId);
      console.log(`  ${r.Member.Title} → ${r.RoleDefinitionBindings.results.map((b) => b.Name).join(", ")}`);
      if (want === undefined) {
        if (roles.length) problems.push(`unexpected access for ${r.Member.Title}`);
      } else {
        seen.add(r.PrincipalId);
        if (!(roles.length === 1 && roles[0] === want)) problems.push(`${r.Member.Title} has [${roles}] not [${want}]`);
      }
    }
    const stillUnique = (await spAll(`${base}/items?$select=Id,HasUniqueRoleAssignments&$top=5000`)).filter(
      (i) => i.HasUniqueRoleAssignments
    );
    if (stillUnique.length) problems.push(`items with their own permissions: ${stillUnique.map((i) => i.Id).join(", ")}`);
    for (const pid of expected.keys()) if (!seen.has(pid)) problems.push(`principal ${pid} has no access`);
    const props = (await sp(`${base}?$select=HasUniqueRoleAssignments,WriteSecurity,EnableVersioning`)).d;
    if (!props.HasUniqueRoleAssignments) problems.push("still inheriting permissions");
    if (l.id === logId) {
      if (props.WriteSecurity !== 2) problems.push(`WriteSecurity is ${props.WriteSecurity}, expected 2`);
      if (props.EnableVersioning !== false) problems.push("version history is still on");
    }
    if (problems.length) throw new Error(`${l.title} NOT locked as expected:\n  - ${problems.join("\n  - ")}`);
    console.log(`  ✓ verified${l.id === logId ? " (edit-own-items only, no version history)" : ""}`);
  }
}

(args.has("--lock") ? lock() : provision()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
