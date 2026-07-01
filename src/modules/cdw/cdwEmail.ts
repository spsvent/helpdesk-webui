// CDW decision notifications sent from the in-app approval path. Composed from the
// shared sendEmail primitive. (The email one-click path sends its own notifications
// from the Azure Function, so a given decision notifies exactly once.)

import { Client } from "@microsoft/microsoft-graph-client";
import { sendEmail } from "@/shared/graph";
import { APP_URL, escapeHtml, emailShell } from "@/shared/emailHtml";
import { CDWBrief, CdwDecision } from "./types";

function shell(headline: string, bodyHtml: string): string {
  return emailShell(headline, bodyHtml, "SkyPark Help Desk — Creative Brief");
}

function briefInfo(brief: CDWBrief, extra = ""): string {
  return `<div class="info"><h3 style="margin:0 0 8px 0;color:#1e3a5f;">${escapeHtml(brief.title)}</h3>
    ${brief.deadline ? `<p><span class="label">Deadline:</span> ${escapeHtml(brief.deadline)}</p>` : ""}
    ${brief.projectManagerName ? `<p><span class="label">Project Manager:</span> ${escapeHtml(brief.projectManagerName)}</p>` : ""}
    ${brief.quickTake ? `<p><span class="label">Quick Take:</span><br>${escapeHtml(brief.quickTake)}</p>` : ""}
    ${extra}</div>`;
}

function viewButton(brief: CDWBrief): string {
  return `<div class="actions"><a href="${APP_URL}/cdw/?id=${brief.id}" class="btn">Open the Brief</a></div>`;
}

// Dedupe + drop empties, case-insensitively.
function recipients(...emails: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const v = (e || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/**
 * Notify interested parties of an in-app decision.
 * - Approved: the named final recipient + the requester (brief is now public).
 * - Denied / Changes Requested: the requester.
 */
export async function notifyCdwDecision(
  client: Client,
  brief: CDWBrief,
  decision: CdwDecision,
  approverName: string,
  notes?: string
): Promise<void> {
  const notesHtml = notes
    ? `<p style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>`
    : "";

  let headline: string;
  let intro: string;
  let to: string[];

  if (decision === "Approved") {
    headline = "Creative Brief Approved";
    intro = `<p>The creative brief <strong>${escapeHtml(brief.title)}</strong> has been approved by <strong>${escapeHtml(approverName)}</strong> and is now finalized. You are listed to receive the final deliverable.</p>`;
    to = recipients(brief.finalRecipientEmail, brief.requesterEmail);
  } else if (decision === "Denied") {
    headline = "Creative Brief Denied";
    intro = `<p>The creative brief <strong>${escapeHtml(brief.title)}</strong> was denied by <strong>${escapeHtml(approverName)}</strong>.</p>`;
    to = recipients(brief.requesterEmail);
  } else {
    headline = "Creative Brief — Changes Requested";
    intro = `<p><strong>${escapeHtml(approverName)}</strong> requested changes to the creative brief <strong>${escapeHtml(brief.title)}</strong> before it can be approved.</p>`;
    to = recipients(brief.requesterEmail);
  }

  if (to.length === 0) return;
  const subject = `[${decision}] Creative Brief: ${brief.title}`;
  const html = shell(headline, intro + briefInfo(brief, notesHtml) + viewButton(brief));

  await Promise.all(
    to.map((email) =>
      sendEmail(client, email, subject, html).catch((e) =>
        console.error(`[notifyCdwDecision] email to ${email} failed:`, e)
      )
    )
  );
}
