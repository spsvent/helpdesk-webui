// In-app purchase decision notifications (the email one-click path sends its own from
// the Azure Function). Composed from the shared sendEmail primitive.

import { Client } from "@microsoft/microsoft-graph-client";
import { sendEmail } from "@/shared/graph";
import { APP_URL, escapeHtml, emailShell } from "@/shared/emailHtml";
import { fetchRBACConfig } from "@/lib/rbacConfigService";
import { PurchaseMessage, PurchaseRequest } from "./types";
import { PurchaseDecision } from "./purchaseService";

// Decisions that put a request into the order queue, so purchasers need to hear
// about them. "Approved & Ordered" is excluded — the GM already placed that order.
const ORDERABLE_DECISIONS: PurchaseDecision[] = ["Approved", "Approved with Changes"];

// Does this decision put the request in front of the purchasers? Exported so the
// rule is unit-testable without mocking Graph.
export function notifiesPurchasers(decision: PurchaseDecision): boolean {
  return ORDERABLE_DECISIONS.includes(decision);
}

// Purchaser group members, from the RBACGroups list (which is what decides who
// actually sees the order queue) with the build-time group id as a fallback for
// when the list can't be read. Mirrors emailService.getApproverEmails.
async function getPurchaserEmails(client: Client): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const config = await fetchRBACConfig(client);
    config.purchaserGroupIds.forEach((id) => ids.add(id));
  } catch (e) {
    console.error("[getPurchaserEmails] RBAC config unavailable, falling back to env:", e);
  }
  const envGroupId = process.env.NEXT_PUBLIC_PURCHASER_GROUP_ID;
  if (envGroupId) ids.add(envGroupId);
  if (ids.size === 0) return [];

  const emails = new Set<string>();
  await Promise.all(
    Array.from(ids).map(async (groupId) => {
      try {
        const res = await client.api(`/groups/${groupId}/members`).select("mail,userPrincipalName").get();
        for (const m of res.value || []) {
          const email = (m.mail || m.userPrincipalName || "").trim();
          if (email) emails.add(email.toLowerCase());
        }
      } catch (e) {
        console.error(`[getPurchaserEmails] could not read members of ${groupId}:`, e);
      }
    })
  );
  return Array.from(emails);
}

// Tell the purchasers an approved request is ready to order. The in-app decision
// path used to skip this entirely — only the one-click-from-email path sent it —
// so requests a GM approved inside the app sat in the queue silently.
export async function notifyPurchasersReadyToOrder(
  client: Client,
  pr: PurchaseRequest,
  approverName: string
): Promise<void> {
  const purchasers = await getPurchaserEmails(client);
  if (purchasers.length === 0) {
    console.warn("[notifyPurchasersReadyToOrder] no purchasers resolved — nobody notified");
    return;
  }
  const html = emailShell(
    "Purchase Approved — Ready to Order",
    `<p>A purchase request was approved by <strong>${escapeHtml(approverName)}</strong> and is ready to order.</p>
      <div class="info">
        <p><span class="label">Request:</span> ${escapeHtml(pr.title)}</p>
        ${pr.requesterName ? `<p><span class="label">Requested by:</span> ${escapeHtml(pr.requesterName)}</p>` : ""}
        ${pr.needByDate ? `<p><span class="label">Needed by:</span> ${escapeHtml(pr.needByDate)}</p>` : ""}
      </div>
      <div class="actions"><a href="${APP_URL}/orders" class="btn">Open the order queue</a></div>`,
    "SkyPark Help Desk — Purchase Request"
  );
  await Promise.all(
    purchasers.map((to) =>
      sendEmail(client, to, `[Purchase Approved] ${pr.title}`, html).catch((e) =>
        console.error("[notifyPurchasersReadyToOrder] failed for", to, e)
      )
    )
  );
}

// Fan out the notifications for an in-app decision: the requester always hears the
// outcome, and on an orderable approval the purchasers are told it's ready to order.
// Both live here so a new decision path can't ship with half the notifications.
export async function notifyPurchaseDecision(
  client: Client,
  pr: PurchaseRequest,
  decision: PurchaseDecision,
  approverName: string,
  notes?: string
): Promise<void> {
  const to = pr.requesterEmail?.trim();
  if (to) {
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

  if (notifiesPurchasers(decision)) {
    await notifyPurchasersReadyToOrder(client, pr, approverName);
  }
}

// Notify everyone involved that a request was cancelled. Best-effort: individual
// send failures are logged, not thrown. The actor is excluded (they just did it).
export async function notifyPurchaseCancelled(
  client: Client,
  pr: PurchaseRequest,
  actorName: string,
  actorEmail: string,
  reason?: string
): Promise<void> {
  const actor = actorEmail?.trim().toLowerCase();
  const recipients = purchaseThreadParticipants(pr).filter((e) => e.toLowerCase() !== actor);
  if (recipients.length === 0) return;
  const reasonHtml = reason ? `<p><span class="label">Reason:</span> ${escapeHtml(reason)}</p>` : "";
  const html = emailShell(
    "Purchase Request Cancelled",
    `<p><strong>${escapeHtml(actorName)}</strong> cancelled the purchase request <strong>${escapeHtml(pr.title)}</strong>.</p>
      ${reasonHtml}
      <div class="actions"><a href="${APP_URL}/purchase?id=${pr.id}" class="btn">Open the Request</a></div>`,
    "SkyPark Help Desk — Purchase Request"
  );
  await Promise.all(
    recipients.map((to) =>
      sendEmail(client, to, `[Cancelled] Purchase Request: ${pr.title}`, html).catch((e) =>
        console.error("[notifyPurchaseCancelled] failed for", to, e)
      )
    )
  );
}

// Notify everyone involved that an already-ordered request was edited. Best-effort.
export async function notifyPurchaseEdited(
  client: Client,
  pr: PurchaseRequest,
  actorName: string,
  actorEmail: string,
  reason?: string
): Promise<void> {
  const actor = actorEmail?.trim().toLowerCase();
  const recipients = purchaseThreadParticipants(pr).filter((e) => e.toLowerCase() !== actor);
  if (recipients.length === 0) return;
  const reasonHtml = reason ? `<p><span class="label">Reason:</span> ${escapeHtml(reason)}</p>` : "";
  const html = emailShell(
    "Purchase Request Edited",
    `<p><strong>${escapeHtml(actorName)}</strong> edited the purchase request <strong>${escapeHtml(pr.title)}</strong> after it was ordered.</p>
      ${reasonHtml}
      <div class="actions"><a href="${APP_URL}/purchase?id=${pr.id}" class="btn">Open the Request</a></div>`,
    "SkyPark Help Desk — Purchase Request"
  );
  await Promise.all(
    recipients.map((to) =>
      sendEmail(client, to, `[Edited] Purchase Request: ${pr.title}`, html).catch((e) =>
        console.error("[notifyPurchaseEdited] failed for", to, e)
      )
    )
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
