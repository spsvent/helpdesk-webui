// In-app purchase decision notifications (the email one-click path sends its own from
// the Azure Function). Composed from the shared sendEmail primitive.

import { Client } from "@microsoft/microsoft-graph-client";
import { sendEmail } from "@/shared/graph";
import { APP_URL, escapeHtml, emailShell } from "@/shared/emailHtml";
import { PurchaseMessage, PurchaseRequest } from "./types";
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

// Everyone involved in a request (requester, approver, purchaser, inventory,
// creator, extra participants) — deduped, for message-thread notifications.
export function purchaseThreadParticipants(pr: PurchaseRequest): string[] {
  const raw = [
    pr.requesterEmail,
    pr.approvedByEmail,
    pr.purchasedByEmail,
    pr.receivedByEmail,
    pr.createdByEmail,
    ...(pr.participantEmails ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const t = e?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Email the other people on a request when someone posts a message (the author is
// excluded). Best-effort: individual send failures are logged, not thrown.
export async function notifyPurchaseMessage(
  client: Client,
  pr: PurchaseRequest,
  message: PurchaseMessage
): Promise<void> {
  const author = message.email?.trim().toLowerCase();
  const recipients = purchaseThreadParticipants(pr).filter((e) => e.toLowerCase() !== author);
  if (recipients.length === 0) return;
  const html = emailShell(
    "New message on a purchase request",
    `<p><strong>${escapeHtml(message.author)}</strong> left a message on <strong>${escapeHtml(pr.title)}</strong>:</p>
      <div class="info">${escapeHtml(message.text)}</div>
      <div class="actions"><a href="${APP_URL}/purchase?id=${pr.id}" class="btn">Open the Request</a></div>`,
    "SkyPark Help Desk — Purchase Request"
  );
  await Promise.all(
    recipients.map((to) =>
      sendEmail(client, to, `New message: ${pr.title}`, html).catch((e) =>
        console.error("[notifyPurchaseMessage] failed for", to, e)
      )
    )
  );
}
