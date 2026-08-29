# Help Desk Agent Tools

> **Building anything against the ticketing system? Read
> [`docs/INTEGRATION.md`](../../docs/INTEGRATION.md) first** — every endpoint, auth
> scheme, webhook, SharePoint list, enum, and known limit, with
> [`docs/openapi.yaml`](../../docs/openapi.yaml) as the machine-readable companion.
> These tools cover the common cases; the doc covers the whole surface.

CLI + MCP server that let any agent or script (e.g. on the Fedora server) read a
Help Desk ticket, add comments, and change status through the Function App's
agent API — with the same activity logging and email notifications a human
action produces.

Feed an agent a link like `https://tickets.spsvent.net?ticket=582` and it can
pull the full ticket + comment thread, post a reply to the requester, and mark
the ticket Resolved.

## Components

| File | Purpose |
|------|---------|
| `helpdesk-client.mjs` | Shared API client (parses ids/URLs, calls the agent endpoints) |
| `helpdesk.mjs` | CLI — works from Bash, cron, any script |
| `mcp-server.mjs` | Stdio MCP server exposing the same operations as typed tools |

All dependency-free; requires Node >= 18.

## Server-side prerequisite

The agent API lives in the Function App (`azure-functions/src/functions/agentApi.js`)
and is disabled until `AGENT_API_KEY` is set in the Function App's environment
variables. Generate a key (`openssl rand -hex 32`), set it there, and use the same
value client-side.

Endpoints (all require the `x-agent-key` header):

- `GET  /api/agent/tickets/{id}` — fields + full comment thread
- `GET  /api/agent/tickets?status=...&top=...` — summary list
- `POST /api/agent/tickets/{id}/comments` — `{ text, isInternal?, notify?, actorLabel?, actorEmail? }`
- `POST /api/agent/tickets/{id}/status` — `{ status, note?, notify?, actorLabel?, actorEmail? }`

`{id}` is the SharePoint list item id — the same number as in `?ticket=N` links.

**Creating tickets uses a different endpoint and a different key.** The agent API is
read/comment/status only. `create` targets `POST /api/createticket`
(`azure-functions/src/functions/createTicket.js`), which is gated by an Azure
Functions **host key** (`?code=`), not `x-agent-key`. Set `HELPDESK_FUNCTION_KEY` as
well if you want `create` to work; the other four commands don't need it.

## Client configuration

| Env var | Required | Meaning |
|---------|----------|---------|
| `HELPDESK_AGENT_KEY` | yes | Must match the Function App's `AGENT_API_KEY` |
| `HELPDESK_FUNCTION_KEY` | for `create` only | Azure Functions host key for `CreateTicket`. Portal → Function App → App keys, or `az functionapp keys list`. |
| `HELPDESK_AGENT_API_URL` | no | Defaults to the production Function App `/api` base |
| `HELPDESK_ACTOR` | no | Label recorded on comments/activity log (default "Automation Agent") |
| `HELPDESK_ACTOR_EMAIL` | no | Enables self-notification suppression for that address |
| `HELPDESK_DOCS_PATH` | no | Override the path `get_integration_docs` reads. Defaults to `../../docs/INTEGRATION.md` relative to the server. |

Suggested setup on a server: put the vars in `~/.config/helpdesk-agent/env` and
source it from your shell profile.

## CLI usage

```bash
node helpdesk.mjs get "https://tickets.spsvent.net?ticket=582"
node helpdesk.mjs get 582
node helpdesk.mjs list --status "In Progress"
node helpdesk.mjs comment 582 "Fixed the DNS entry; please confirm." 
node helpdesk.mjs comment 582 "root cause: stale cache" --internal
node helpdesk.mjs status 582 Resolved --note "Fixed by restarting the service"

# Create a ticket (needs HELPDESK_FUNCTION_KEY)
node helpdesk.mjs create "POS-3 offline" "No check-in for 10 minutes." \
  --type Tech --priority High --source nagios --ref pos3-offline
```

Run `helpdesk` with no arguments for the full option list, including the valid
statuses, priorities, and departments.

**On `--ref` (`externalRef`):** it is the dedup key. A repeat while an earlier
ticket is still open adds a throttled `Repeat alert` comment to that ticket and
returns `deduped: true` instead of creating a duplicate. Use a *stable* value per
alert condition — a ref containing a timestamp defeats dedupe and floods the queue.

Only `Problem` tickets can be created through the API. `Request` tickets need the
in-app GM approval flow.

Optionally symlink it: `ln -s /path/to/tools/helpdesk-agent/helpdesk.mjs ~/.local/bin/helpdesk`.

Public comments and status changes email the requester + participants (with
opt-out and self-notification suppression applied server-side); `--internal`
comments and `--no-notify` skip emails.

## MCP registration (Claude Code)

User scope (available to every project on the machine):

```bash
claude mcp add --scope user helpdesk \
  -e HELPDESK_AGENT_KEY=<key> \
  -e HELPDESK_ACTOR="Claude (fedora-server)" \
  -- node /path/to/repo/tools/helpdesk-agent/mcp-server.mjs
```

Tools exposed: `get_ticket`, `list_tickets`, `add_comment`, `set_ticket_status`,
`create_ticket`, `get_integration_docs`.
All ticket arguments accept a bare id, `#582`, or a full `?ticket=` URL.

`get_integration_docs` returns `docs/INTEGRATION.md` verbatim, so an agent with only
the MCP server (no repo checkout) can still read the full integration reference
before building against the system.
