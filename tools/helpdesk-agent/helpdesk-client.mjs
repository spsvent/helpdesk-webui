// Shared client for the Help Desk agent API. Used by both the CLI (helpdesk.mjs)
// and the MCP server (mcp-server.mjs). Dependency-free (Node >= 18 for fetch).

const DEFAULT_BASE_URL =
  "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api";

// Enums the API validates against. Exported so the CLI and MCP server describe the
// same values the server enforces, instead of each keeping its own copy.
export const STATUSES = ["New", "In Progress", "On Hold", "Resolved", "Closed"];
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
// Departments. Mirrors PROBLEM_TYPES in azure-functions/src/lib/ticketIntake.js,
// whose own source of truth is CATEGORY_HIERARCHY in src/lib/categoryConfig.ts.
// Adding a department means editing all three.
export const PROBLEM_TYPES = [
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

// Base config that needs no secret — safe for callers that only want the actor
// label or the base URL.
function baseConfig() {
  return {
    baseUrl: (process.env.HELPDESK_AGENT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    actorLabel: process.env.HELPDESK_ACTOR || "Automation Agent",
    actorEmail: process.env.HELPDESK_ACTOR_EMAIL || "",
  };
}

export function getConfig() {
  const key = process.env.HELPDESK_AGENT_KEY;
  if (!key) {
    throw new Error(
      "HELPDESK_AGENT_KEY is not set. Export it (or add it to ~/.config/helpdesk-agent/env) — it must match the Function App's AGENT_API_KEY setting."
    );
  }
  return { ...baseConfig(), key };
}

// createTicket targets CreateTicket, not the agent API, so it authenticates with
// an Azure Functions host key (?code=) instead of x-agent-key. Different secret,
// deliberately — see docs/INTEGRATION.md §1.
export function getFunctionKey() {
  const key = process.env.HELPDESK_FUNCTION_KEY;
  if (!key) {
    throw new Error(
      "HELPDESK_FUNCTION_KEY is not set. Creating a ticket uses the CreateTicket endpoint, which is gated by an Azure Functions host key (?code=), not HELPDESK_AGENT_KEY. Get one from the Portal (Function App -> App keys) or `az functionapp keys list`."
    );
  }
  return key;
}

// Accepts a bare id ("582"), "#582", or any helpdesk URL containing ?ticket=582.
export function parseTicketId(input) {
  const s = String(input || "").trim();
  const urlMatch = s.match(/[?&]ticket=(\d+)/);
  if (urlMatch) return urlMatch[1];
  const idMatch = s.match(/^#?(\d+)$/);
  if (idMatch) return idMatch[1];
  throw new Error(`Cannot parse a ticket id from: ${s}`);
}

async function call(method, path, body) {
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      "x-agent-key": cfg.key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${method} ${path}: ${data.error || text.slice(0, 300)}`);
  }
  return data;
}

export async function getTicket(idOrUrl) {
  const id = parseTicketId(idOrUrl);
  return call("GET", `/agent/tickets/${id}`);
}

export async function listTickets({ status, top } = {}) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (top) q.set("top", String(top));
  const qs = q.toString();
  return call("GET", `/agent/tickets${qs ? `?${qs}` : ""}`);
}

export async function addComment(idOrUrl, text, { isInternal = false, notify = true } = {}) {
  const id = parseTicketId(idOrUrl);
  const cfg = getConfig();
  return call("POST", `/agent/tickets/${id}/comments`, {
    text,
    isInternal,
    notify,
    actorLabel: cfg.actorLabel,
    actorEmail: cfg.actorEmail,
  });
}

export async function setStatus(idOrUrl, status, { note, notify = true } = {}) {
  const id = parseTicketId(idOrUrl);
  const cfg = getConfig();
  return call("POST", `/agent/tickets/${id}/status`, {
    status,
    note,
    notify,
    actorLabel: cfg.actorLabel,
    actorEmail: cfg.actorEmail,
  });
}

// Create a ticket via the CreateTicket intake endpoint (host-key auth).
//
// Note the differences from the agent API: only "Problem" tickets are supported
// (Request tickets need the GM approval flow), and passing an externalRef makes
// the call idempotent-ish — a repeat while an earlier ticket is still open adds a
// throttled "Repeat alert" comment and returns { deduped: true } with that
// ticket's id, rather than creating a duplicate.
export async function createTicket({
  title,
  description,
  problemType,
  priority,
  location,
  problemTypeSub,
  problemTypeSub2,
  requesterEmail,
  assigneeEmail,
  source,
  externalRef,
} = {}) {
  const cfg = baseConfig();
  const code = getFunctionKey();
  const payload = { title, description, problemType, category: "Problem" };
  if (priority) payload.priority = priority;
  if (location) payload.location = location;
  if (problemTypeSub) payload.problemTypeSub = problemTypeSub;
  if (problemTypeSub2) payload.problemTypeSub2 = problemTypeSub2;
  if (requesterEmail) payload.requesterEmail = requesterEmail;
  if (assigneeEmail) payload.assigneeEmail = assigneeEmail;
  if (externalRef) payload.externalRef = externalRef;
  payload.source = source || cfg.actorLabel;

  const res = await fetch(`${cfg.baseUrl}/createticket?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    // Validation failures carry a details[] array — surface it, it names the field.
    const detail = Array.isArray(data.details) ? data.details.join("; ") : data.error || text.slice(0, 300);
    throw new Error(`HTTP ${res.status} POST /createticket: ${detail}`);
  }
  return data;
}
