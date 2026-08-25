#!/usr/bin/env node
// Minimal stdio MCP server exposing the Help Desk agent API as tools.
// Dependency-free: speaks newline-delimited JSON-RPC per the MCP stdio
// transport directly, so installation is just a git checkout + env vars.
//
// Register (Claude Code):
//   claude mcp add --scope user helpdesk -e HELPDESK_AGENT_KEY=... -- node /path/to/mcp-server.mjs

import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTicket,
  listTickets,
  addComment,
  setStatus,
  createTicket,
  PROBLEM_TYPES,
  PRIORITIES,
  STATUSES,
} from "./helpdesk-client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// tools/helpdesk-agent/ -> repo root -> docs/. HELPDESK_DOCS_PATH overrides it for
// installs where the server was copied out of the repo rather than run from it.
const DOCS_PATH =
  process.env.HELPDESK_DOCS_PATH || join(HERE, "..", "..", "docs", "INTEGRATION.md");

const TICKET_ARG = {
  type: "string",
  description: "Ticket id, '#582', or a helpdesk URL like https://tickets.spsvent.net?ticket=582",
};

const TOOLS = [
  {
    name: "get_ticket",
    description:
      "Fetch a Help Desk ticket's full fields and complete comment thread (public and internal comments).",
    inputSchema: {
      type: "object",
      properties: { ticket: TICKET_ARG },
      required: ["ticket"],
    },
    run: (a) => getTicket(a.ticket),
  },
  {
    name: "list_tickets",
    description: "List Help Desk tickets, most recently modified first. Optionally filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: STATUSES,
          description: "Only return tickets with this status",
        },
        top: { type: "number", description: "Max results (default 50, max 200)" },
      },
    },
    run: (a) => listTickets(a),
  },
  {
    name: "add_comment",
    description:
      "Add a comment to a Help Desk ticket. Public comments (default) email the requester and participants; internal comments are only visible to staff and send no email.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: TICKET_ARG,
        text: { type: "string", description: "Comment body (plain text)" },
        isInternal: { type: "boolean", description: "true = staff-only note, no notification (default false)" },
        notify: { type: "boolean", description: "Set false to skip emails on a public comment (default true)" },
      },
      required: ["ticket", "text"],
    },
    run: (a) => addComment(a.ticket, a.text, { isInternal: a.isInternal === true, notify: a.notify !== false }),
  },
  {
    name: "set_ticket_status",
    description:
      "Change a Help Desk ticket's status (New, In Progress, On Hold, Resolved, Closed). Emails the requester and participants unless notify is false. An optional note is recorded as an internal comment.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: TICKET_ARG,
        status: { type: "string", enum: STATUSES },
        note: { type: "string", description: "Optional internal note explaining the change" },
        notify: { type: "boolean", description: "Set false to skip notification emails (default true)" },
      },
      required: ["ticket", "status"],
    },
    run: (a) => setStatus(a.ticket, a.status, { note: a.note, notify: a.notify !== false }),
  },
  {
    name: "create_ticket",
    description:
      "File a new Help Desk ticket. Use this for alerts, monitoring, and anything a script needs to report. " +
      "The ticket is auto-assigned by the same routing rules the web form uses, the assignee is emailed, and " +
      "the creation is written to the activity log. Only 'Problem' tickets can be created this way — Request " +
      "tickets need the in-app GM approval flow. " +
      "Pass externalRef for anything that can re-fire: a repeat while an earlier ticket is still open adds a " +
      "throttled comment to that ticket and returns deduped:true instead of creating a duplicate. " +
      "Requires HELPDESK_FUNCTION_KEY (a host key) in addition to HELPDESK_AGENT_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short summary — becomes the ticket title" },
        description: { type: "string", description: "Full detail: what happened, where, any error text" },
        problemType: { type: "string", enum: PROBLEM_TYPES, description: "Department that owns this" },
        priority: { type: "string", enum: PRIORITIES, description: "Default Normal" },
        location: { type: "string" },
        problemTypeSub: { type: "string", description: "Sub-category within the department" },
        problemTypeSub2: { type: "string", description: "Second-level sub-category" },
        requesterEmail: { type: "string", description: "Who this is on behalf of" },
        assigneeEmail: { type: "string", description: "Overrides the auto-assign rules" },
        source: { type: "string", description: "What filed it, e.g. 'uptime-kuma'. Defaults to the actor label." },
        externalRef: {
          type: "string",
          description:
            "Stable dedup key for a recurring alert condition (e.g. 'pos3-offline'). Must NOT vary per " +
            "event — a ref containing a timestamp defeats deduplication and floods the queue.",
        },
      },
      required: ["title", "description", "problemType"],
    },
    run: (a) => createTicket(a),
  },
  {
    name: "get_integration_docs",
    description:
      "Return the full SkyPark Help Desk integration reference (docs/INTEGRATION.md): every endpoint, auth " +
      "scheme, webhook, SharePoint list, enum, environment variable, and known limit. Read this before " +
      "building anything against the ticketing system — it covers capabilities these MCP tools do not expose, " +
      "such as the Uptime Kuma webhook, the approval-token endpoints, and the notification suppression rules.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      try {
        return { doc: await readFile(DOCS_PATH, "utf8") };
      } catch (e) {
        throw new Error(
          `Could not read ${DOCS_PATH}: ${e.message}. This tool reads the doc from the repo checkout that ` +
            `hosts the MCP server; set HELPDESK_DOCS_PATH or re-register the server from a full checkout.`
        );
      }
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "helpdesk", version: "1.0.0" },
    });
  } else if (method === "notifications/initialized" || method === "notifications/cancelled") {
    // Notifications — no response.
  } else if (method === "ping") {
    reply(id, {});
  } else if (method === "tools/list") {
    reply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  } else if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return replyError(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const result = await tool.run(params.arguments || {});
      // get_integration_docs returns markdown — hand it back as-is rather than
      // JSON-escaping it into an unreadable single line.
      const text =
        result && typeof result.doc === "string" ? result.doc : JSON.stringify(result, null, 2);
      reply(id, { content: [{ type: "text", text }] });
    } catch (e) {
      reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
    }
  } else if (id !== undefined) {
    replyError(id, -32601, `Method not found: ${method}`);
  }
}

// Every handler is async (network or disk), so exiting the moment stdin closes
// would drop replies that are still in flight. That never bites an interactive
// client, which holds stdin open, but it silently truncates piped input — which
// is exactly how these tools get smoke-tested. Drain before exiting.
let inFlight = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  inFlight++;
  handle(msg)
    .catch((e) => {
      if (msg.id !== undefined) replyError(msg.id, -32603, e.message);
    })
    .finally(() => {
      inFlight--;
      maybeExit();
    });
});
rl.on("close", () => {
  stdinClosed = true;
  maybeExit();
});
