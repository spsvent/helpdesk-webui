// In-app purchase decision notifications (the email one-click path sends its own from
// the Azure Function). Composed from the shared sendEmail primitive.

import { Client } from "@microsoft/microsoft-graph-client";
import { sendEmail } from "@/shared/graph";
import { APP_URL, escapeHtml, emailShell } from "@/shared/emailHtml";
import { PurchaseRequest } from "./types";
import { PurchaseDecision } from "./purchaseService";

// Notify the requester of an in-app decision.
export async function notifyPurchaseDecision(
  client: Client,
  pr: PurchaseRequest,
  decision: PurchaseDecision,
  approverName: string,
  notes?: string
): Promise<void> {
  const to = pr.requesterEmail?.trim();
  if (!to) return;
  const notesHtml = notes ? `<p><span class="label">Notes:</span> ${escapeHtml(notes)}</p>` : "";
  const html = emailShell(
    `Purchase Request ${decision}`,
    `<p>Your purchase request <strong>${escapeHtml(pr.title)}</strong> was <strong>${escapeHtml(decision)}</strong> by ${escapeHtml(approverName)}.</p>
      ${notesHtml}
      <div class="actions"><a href="${APP_URL}/purchase?id=${pr.id}" class="btn">Open the Request</a></div>`,
    "SkyPark Help Desk — Purchase Request"
  );
  await sendEmail(client, to, `[${decision}] Purchase Request: ${pr.title}`, html).catch((e) =>
    console.error("[notifyPurchaseDecision] failed:", e)
  );
}
