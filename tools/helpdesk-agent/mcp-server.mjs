#!/usr/bin/env node
// Minimal stdio MCP server exposing the Help Desk agent API as tools.
// Dependency-free: speaks newline-delimited JSON-RPC per the MCP stdio
// transport directly, so installation is just a git checkout + env vars.
//
// Register (Claude Code):
//   claude mcp add --scope user helpdesk -e HELPDESK_AGENT_KEY=... -- node /path/to/mcp-server.mjs

import { createInterface } from "node:readline";
import { getTicket, listTickets, addComment, setStatus } from "./helpdesk-client.mjs";

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
          enum: ["New", "In Progress", "On Hold", "Resolved", "Closed"],
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
        status: { type: "string", enum: ["New", "In Progress", "On Hold", "Resolved", "Closed"] },
        note: { type: "string", description: "Optional internal note explaining the change" },
        notify: { type: "boolean", description: "Set false to skip notification emails (default true)" },
      },
      required: ["ticket", "status"],
    },
    run: (a) => setStatus(a.ticket, a.status, { note: a.note, notify: a.notify !== false }),
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
      reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
    }
  } else if (id !== undefined) {
    replyError(id, -32601, `Method not found: ${method}`);
  }
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
  handle(msg).catch((e) => {
    if (msg.id !== undefined) replyError(msg.id, -32603, e.message);
  });
});
rl.on("close", () => process.exit(0));
