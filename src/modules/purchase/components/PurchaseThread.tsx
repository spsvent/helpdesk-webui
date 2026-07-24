"use client";

import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/shared/graph";
import type { PurchaseRequest } from "../types";
import { postPurchaseMessage } from "../purchaseService";
import { notifyPurchaseMessage } from "../purchaseEmail";

function messageTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A lightweight two-way thread on a purchase request: the purchaser can ask the
// requester + approver a question (out of stock, substitute, price change), and
// they can answer. Everyone on the request is emailed when a message is posted.
export default function PurchaseThread({
  pr,
  onUpdate,
}: {
  pr: PurchaseRequest;
  onUpdate: (pr: PurchaseRequest) => void;
}) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thread = pr.thread ?? [];

  async function send() {
    const body = text.trim();
    if (!account || !body) return;
    setSending(true);
    setError(null);
    try {
      const client = getGraphClient(instance, account);
      const message = {
        author: account.name || account.username || "",
        email: account.username || "",
        text: body,
        at: new Date().toISOString(),
      };
      const updated = await postPurchaseMessage(client, pr.id, message);
      onUpdate(updated);
      // Best-effort: notify the other parties. Don't block the UI on it.
      notifyPurchaseMessage(client, updated, message).catch(() => {});
      setText("");
    } catch (e) {
      console.error("[PurchaseThread] send failed:", e);
      setError("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-8 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-text-primary">Messages</h2>
      <p className="mt-0.5 text-xs text-text-secondary">
        Questions between the requester, approver, and purchaser. Everyone on this request is emailed when you post.
      </p>

      <div className="mt-3 space-y-2">
        {thread.length === 0 && <p className="text-sm text-text-secondary">No messages yet.</p>}
        {thread.map((m, i) => (
          <div key={i} className="rounded-lg border border-border bg-bg-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-primary">{m.author || m.email}</span>
              <span className="text-xs text-text-secondary">{messageTime(m.at)}</span>
            </div>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send message"}
          </button>
        </div>
      </div>
    </div>
  );
}
