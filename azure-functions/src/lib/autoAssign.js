// Pure auto-assignment resolution for the create-ticket API. Ported from the SPA's
// autoAssignConfigService (src/lib/autoAssignConfigService.ts) so an API-created
// ticket routes to the same assignee the web form would pick. No I/O — unit-testable.
//
// AutoAssign SharePoint list columns: Department (=ProblemType), SubCategory
// (=ProblemTypeSub), SpecificType (=ProblemTypeSub2), Category, Priority,
// AssignToEmail, SortOrder (lower = higher priority), IsActive.

function parseAutoAssignRules(items) {
  const rules = [];
  for (const item of items || []) {
    const f = (item && item.fields) || {};
    if (f.IsActive === false || !f.AssignToEmail) continue;
    rules.push({
      department: f.Department || undefined,
      subCategory: f.SubCategory || undefined,
      specificType: f.SpecificType || undefined,
      category: f.Category || undefined,
      priority: f.Priority || undefined,
      assignToEmail: f.AssignToEmail,
      sortOrder: typeof f.SortOrder === "number" ? f.SortOrder : 100,
    });
  }
  rules.sort((a, b) => a.sortOrder - b.sortOrder);
  return rules;
}

// First rule whose specified conditions all match wins; returns its email or null.
function findAssignee(rules, ticket) {
  const t = ticket || {};
  for (const r of rules || []) {
    if (r.department && r.department !== t.problemType) continue;
    if (r.subCategory && r.subCategory !== t.problemTypeSub) continue;
    if (r.specificType && r.specificType !== t.problemTypeSub2) continue;
    if (r.category && r.category !== t.category) continue;
    if (r.priority && r.priority !== t.priority) continue;
    return r.assignToEmail;
  }
  return null;
}

module.exports = { parseAutoAssignRules, findAssignee };
