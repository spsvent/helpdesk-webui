"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket } from "@/types/ticket";
import { getGraphClient, sendEmail } from "@/lib/graphClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lively-coast-062dfc51e.1.azurestaticapps.net";
const GENERAL_MANAGERS_GROUP_ID = process.env.NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID || "";

// 24-hour cooldown per ticket (stored in localStorage)
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function getCooldownKey(ticketId: string): string {
  return `nudge_cooldown_${ticketId}`;
}

function isOnCooldown(ticketId: string): boolean {
  try {
    const lastNudge = localStorage.getItem(getCooldownKey(ticketId));
    if (!lastNudge) return false;
    return Date.now() - parseInt(lastNudge, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function setCooldown(ticketId: string): void {
  try {
    localStorage.setItem(getCooldownKey(ticketId), Date.now().toString());
  } catch {
    // localStorage may be unavailable
  }
}

function getRemainingCooldown(ticketId: string): string {
  try {
    const lastNudge = localStorage.getItem(getCooldownKey(ticketId));
    if (!lastNudge) return "";
    const elapsed = Date.now() - parseInt(lastNudge, 10);
    const remaining = COOLDOWN_MS - elapsed;
    if (remaining <= 0) return "";
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${mins}m`;
  } catch {
    return "";
  }
}

interface NudgeApprovalButtonProps {
  ticket: Ticket;
}

export default function NudgeApprovalButton({ ticket }: NudgeApprovalButtonProps) {
  const { instance, accounts } = useMsal();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onCooldown] = useState(() => isOnCooldown(ticket.id));

  const handleNudge = async () => {
    if (!accounts[0] || !GENERAL_MANAGERS_GROUP_ID) return;

    setSending(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const senderName = accounts[0].name || accounts[0].username;

      // Fetch GM group members
      const response = await client
        .api(`/groups/${GENERAL_MANAGERS_GROUP_ID}/members`)
        .select("mail,userPrincipalName,displayName")
        .get();

      const gmEmails: string[] = (response.value || [])
        .map((member: { mail?: string; userPrincipalName?: string }) =>
          member.mail || member.userPrincipalName
        )
        .filter(Boolean);

      if (gmEmails.length === 0) {
        setError("No GM recipients found");
        return;
      }

      const ticketNumber = ticket.ticketNumber || ticket.id;
      const subject = `Approval Nudge: Ticket #${ticketNumber} is awaiting your decision`;
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">Approval Reminder</h2>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
            <p>${senderName} is requesting your attention on a pending approval:</p>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 16px 0;">
              <h3 style="margin: 0 0 8px 0; color: #1e3a5f;">Ticket #${ticketNumber}: ${ticket.title}</h3>
              <p style="margin: 4px 0; color: #6b7280;"><strong>Category:</strong> ${ticket.category}</p>
              <p style="margin: 4px 0; color: #6b7280;"><strong>Department:</strong> ${ticket.problemType}</p>
              <p style="margin: 4px 0; color: #6b7280;"><strong>Requester:</strong> ${ticket.originalRequester || ticket.requester.displayName}</p>
              <p style="margin: 4px 0; color: #6b7280;"><strong>Priority:</strong> ${ticket.priority}</p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}?ticket=${ticket.id}" style="display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                View Ticket
              </a>
            </div>
          </div>
          <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 14px;">
            SkyPark Help Desk
          </div>
        </div>
      `;

      // Send to all GMs in parallel
      await Promise.all(
        gmEmails.map((email) =>
          sendEmail(client, email, subject, htmlContent).catch((e) =>
            console.error(`Failed to send nudge to ${email}:`, e)
          )
        )
      );

      setCooldown(ticket.id);
      setSent(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || "Failed to send nudge");
    } finally {
      setSending(false);
    }
  };

  if (onCooldown) {
    const remaining = getRemainingCooldown(ticket.id);
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-text-secondary">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Nudge sent. Available again in {remaining || "< 24h"}</span>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>Approval nudge sent to GMs!</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleNudge}
        disabled={sending}
        className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
      >
        {sending ? (
          <>
            <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Nudge for Approval
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
