#!/usr/bin/env node
// CLI for the SkyPark Help Desk agent API.
//
//   helpdesk get <id|url>                       full ticket + comment thread
//   helpdesk list [--status "In Progress"] [--top 50]
//   helpdesk comment <id|url> "text" [--internal] [--no-notify]
//   helpdesk status <id|url> <New|"In Progress"|"On Hold"|Resolved|Closed> [--note "..."] [--no-notify]
//
// Env: HELPDESK_AGENT_KEY (required), HELPDESK_AGENT_API_URL, HELPDESK_ACTOR,
// HELPDESK_ACTOR_EMAIL. Output is JSON on stdout; errors exit non-zero.

import { getTicket, listTickets, addComment, setStatus } from "./helpdesk-client.mjs";

function usage() {
  console.error(`Usage:
  helpdesk get <id|url>
  helpdesk list [--status <status>] [--top <n>]
  helpdesk comment <id|url> <text> [--internal] [--no-notify]
  helpdesk status <id|url> <status> [--note <text>] [--no-notify]`);
  process.exit(2);
}

function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
}

const args = process.argv.slice(2);
const cmd = args.shift();

try {
  let result;
  if (cmd === "get") {
    if (!args[0]) usage();
    result = await getTicket(args[0]);
  } else if (cmd === "list") {
    result = await listTickets({ status: takeOption(args, "--status"), top: takeOption(args, "--top") });
  } else if (cmd === "comment") {
    const isInternal = takeFlag(args, "--internal");
    const notify = !takeFlag(args, "--no-notify");
    const [id, text] = args;
    if (!id || !text) usage();
    result = await addComment(id, text, { isInternal, notify });
  } else if (cmd === "status") {
    const notify = !takeFlag(args, "--no-notify");
    const note = takeOption(args, "--note");
    const [id, status] = args;
    if (!id || !status) usage();
    result = await setStatus(id, status, { note, notify });
  } else {
    usage();
  }
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
