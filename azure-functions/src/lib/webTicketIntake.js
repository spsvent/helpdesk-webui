// Pure helpers for the web-form ticket intake (createUserTicket). No I/O — unit-testable.
//
// Why this exists: the SPA used to create list items itself with the signed-in
// user's delegated token. SharePoint can't tell that write apart from someone
// adding a row in the Lists app, so no permission could block the direct-list
// bypass (see ticket #607). Creation now goes through the Function App app-only,
// which lets the Tickets list drop "Add Items" from everyone's permission level.
//
// Keep the field shape in sync with createTicket() in src/lib/graphClient.ts —
// that function now delegates here instead of building fields client-side.

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CATEGORIES = ["Problem", "Request"];
// Canonical department list — mirrors CATEGORY_HIERARCHY keys in
// src/lib/categoryConfig.ts, NOT the SharePoint ProblemType column's choices,
// which still offer departments retired in the 2026-07 Facilities merge.
const PROBLEM_TYPES = [
  "Tech",
  "Operations",
  "Facilities",
  "Marketing",
  "HR",
  "Customer Service",
  "Inventory",
  "Finance",
  "Food & Beverage",
  "Campground",
  "Retail",
  "Safety",
  "Other",
];

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validate a web-form create payload. The requester is NOT taken from the body —
 * it comes from the EasyAuth principal — so it isn't validated here.
 */
function validateWebTicketInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const errors = [];

  const title = trimStr(b.title);
  const description = trimStr(b.description);
  const problemType = trimStr(b.problemType);
  const category = trimStr(b.category) || "Problem";
  const priority = trimStr(b.priority) || "Normal";

  if (!title) errors.push("title is required");
  if (!description) errors.push("description is required");
  if (!problemType) errors.push("problemType is required");
  else if (!PROBLEM_TYPES.includes(problemType)) {
    errors.push(`problemType must be one of: ${PROBLEM_TYPES.join(", ")}`);
  }
  if (!CATEGORIES.includes(category)) {
    errors.push(`category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if (!PRIORITIES.includes(priority)) {
    errors.push(`priority must be one of: ${PRIORITIES.join(", ")}`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      title,
      description,
      problemType,
      category,
      priority,
      problemTypeSub: trimStr(b.problemTypeSub) || undefined,
      problemTypeSub2: trimStr(b.problemTypeSub2) || undefined,
      location: trimStr(b.location) || undefined,
      assigneeEmail: trimStr(b.assigneeEmail) || undefined,
    },
  };
}

/**
 * Build the SharePoint field bag for a web-form ticket.
 *
 * Mirrors the field set the SPA used to write directly, so existing tickets and
 * new ones stay indistinguishable downstream. `isAdmin` MUST be resolved
 * server-side from the caller's group membership — trusting a client-supplied
 * flag would let anyone self-approve their own Request.
 *
 * @param {object} value       validated input from validateWebTicketInput
 * @param {object} actor       { email, name } from the EasyAuth principal
 * @param {object} lookups     { requesterSiteUserId, adminSiteUserId } (may be null)
 * @param {boolean} isAdmin    server-resolved admin status of `actor`
 * @param {string} nowIso      timestamp to stamp approval dates with
 */
function buildWebTicketFields(value, actor, lookups, isAdmin, nowIso) {
  const fields = {
    Title: value.title,
    Description: value.description,
    Category: value.category,
    Priority: value.priority,
    ProblemType: value.problemType,
    Status: "New",
    SupportChannel: "Web Form",
  };

  if (value.problemTypeSub) fields.ProblemTypeSub = value.problemTypeSub;
  if (value.problemTypeSub2) fields.ProblemTypeSub2 = value.problemTypeSub2;
  if (value.location) fields.Location = value.location;

  // Auto-assignment lives in the OriginalAssignedTo *text* column, not the
  // AssignedTo person field — a person lookup needs the assignee (often a group
  // address) to exist in the site user info list, which isn't guaranteed.
  if (value.assigneeEmail) fields.OriginalAssignedTo = value.assigneeEmail;

  // The item is created app-only, so SharePoint's Author/Created By is the app
  // identity, not the submitter. Record the real submitter in OriginalRequester
  // so ownership checks and the UI keep attributing the ticket to a human.
  if (actor.email) fields.OriginalRequester = actor.email;
  if (lookups.requesterSiteUserId) fields.RequesterLookupId = lookups.requesterSiteUserId;

  // Approval applies to Request tickets ONLY — Problem tickets keep the "None"
  // default. Request by admin is auto-approved (they are the approver of
  // record); by anyone else it waits at Pending.
  if (value.category === "Request") {
    if (isAdmin && actor.email) {
      fields.ApprovalStatus = "Approved";
      fields.ApprovalDate = nowIso;
      if (lookups.adminSiteUserId) fields.ApprovedByLookupId = lookups.adminSiteUserId;
      // Mirror the approver into the text columns; the person field isn't
      // expanded on read, so without these the UI shows "Unknown".
      fields.ApprovedByEmail = actor.email;
      if (actor.name) fields.ApprovedByName = actor.name;
    } else {
      fields.ApprovalStatus = "Pending";
      fields.ApprovalRequestedDate = nowIso;
      if (lookups.requesterSiteUserId) {
        fields.ApprovalRequestedByLookupId = lookups.requesterSiteUserId;
      }
    }
  }

  return fields;
}

/**
 * Decode the EasyAuth x-ms-client-principal header into { email, name }.
 *
 * EasyAuth validates the token before the function runs, so anything in this
 * header is trustworthy — but only when EasyAuth is actually enabled. With it
 * off the header is absent and callers get 401, which is the safe failure.
 * Returns null when the header is missing or unusable.
 */
function parseClientPrincipal(headerValue) {
  if (!headerValue) return null;
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
  } catch {
    return null;
  }

  const claims = Array.isArray(decoded.claims) ? decoded.claims : [];
  const claim = (...types) => {
    for (const t of types) {
      const hit = claims.find((c) => (c.typ || c.type) === t);
      if (hit && hit.val) return hit.val;
    }
    return "";
  };

  // preferred_username is the UPN for work accounts; the long schema URIs are
  // what EasyAuth emits for name/email depending on the identity provider.
  const email =
    claim(
      "preferred_username",
      "upn",
      "email",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    ) || decoded.userDetails || "";

  const name =
    claim("name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") || "";

  if (!email) return null;
  return { email: email.trim(), name: name.trim() };
}

module.exports = {
  PROBLEM_TYPES,
  CATEGORIES,
  PRIORITIES,
  validateWebTicketInput,
  buildWebTicketFields,
  parseClientPrincipal,
};
