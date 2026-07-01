// In-app purchase decision notifications (the email one-click path sends its own from
// the Azure Function). Composed from the shared sendEmail primitive.

import { Client } from "@microsoft/microsoft-graph-client";
import { sendEmail } from "@/shared/graph";
import { PurchaseRequest } from "./types";
import { PurchaseDecision } from "./purchaseService";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tickets.spsvent.net";

function escapeHtml(t: string): string {
  const m: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return t.replace(/[&<>"']/g, (c) => m[c]);
}

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
  const notesHtml = notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : "";
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1e3a5f;">Purchase Request ${escapeHtml(decision)}</h2>
      <p>Your purchase request <strong>${escapeHtml(pr.title)}</strong> was <strong>${escapeHtml(decision)}</strong> by ${escapeHtml(approverName)}.</p>
      ${notesHtml}
      <p><a href="${APP_URL}/purchase?id=${pr.id}" style="color:#1e3a5f;">Open the request</a></p>
    </div></body></html>`;
  await sendEmail(client, to, `[${decision}] Purchase Request: ${pr.title}`, html).catch((e) =>
    console.error("[notifyPurchaseDecision] failed:", e)
  );
}
