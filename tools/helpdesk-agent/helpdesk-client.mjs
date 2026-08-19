// Shared client for the Help Desk agent API. Used by both the CLI (helpdesk.mjs)
// and the MCP server (mcp-server.mjs). Dependency-free (Node >= 18 for fetch).

const DEFAULT_BASE_URL =
  "https://helpdesk-notify-func-d9ephvfxgaavhdg6.westus2-01.azurewebsites.net/api";

export function getConfig() {
  const baseUrl = (process.env.HELPDESK_AGENT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const key = process.env.HELPDESK_AGENT_KEY;
  if (!key) {
    throw new Error(
      "HELPDESK_AGENT_KEY is not set. Export it (or add it to ~/.config/helpdesk-agent/env) — it must match the Function App's AGENT_API_KEY setting."
    );
  }
  return {
    baseUrl,
    key,
    actorLabel: process.env.HELPDESK_ACTOR || "Automation Agent",
    actorEmail: process.env.HELPDESK_ACTOR_EMAIL || "",
  };
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
