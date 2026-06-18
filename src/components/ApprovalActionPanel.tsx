"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, PurchaseLineItem } from "@/types/ticket";
import { loadDraft, clearDraft } from "@/lib/formDraft";
import LineItemsTable from "./LineItemsTable";
import { computeEstimatedTotal, distinctVendorCount } from "@/lib/lineItemHelpers";
import { getGraphClient } from "@/lib/graphClient";
import {
  getPurchaserMembers,
  getGeneralManagerMembers,
  getInventoryMembers,
  GroupMember,
} from "@/lib/emailService";

interface NotificationRecipient {
  email: string;
  displayName: string;
  role: string;
}

type ApprovalDecision = "Approved" | "Denied" | "Changes Requested" | "Approved with Changes" | "Approved & Ordered";

interface ApprovalActionPanelProps {
  ticket: Ticket;
  isPurchaseRequest?: boolean;
  onDecision: (
    decision: ApprovalDecision,
    notes?: string,
    options?: { keptItems?: PurchaseLineItem[]; orderItems?: PurchaseLineItem[] },
  ) => Promise<void>;
}

export default function ApprovalActionPanel({ ticket, isPurchaseRequest = false, onDecision }: ApprovalActionPanelProps) {
  const { instance, accounts } = useMsal();
  const [selectedAction, setSelectedAction] = useState<ApprovalDecision | null>(null);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keptItemIndexes, setKeptItemIndexes] = useState<Set<number>>(
    new Set(ticket.purchaseLineItems?.map((_, i) => i) ?? []),
  );
  const [orderItems, setOrderItems] = useState<PurchaseLineItem[]>(
    ticket.purchaseLineItems ?? [],
  );
  const [sameAsAbove, setSameAsAbove] = useState<Set<number>>(new Set());

  // Group members are fetched lazily when the GM picks an action that triggers
  // notifications. Approve / Approve with Changes notifies Purchasers; Approve &
  // Ordered notifies the Requester + General Managers + Inventory (the GM is
  // doing the purchasing themselves so Purchasers aren't in the loop).
  const [purchaserMembers, setPurchaserMembers] = useState<GroupMember[] | null>(null);
  const [gmMembers, setGmMembers] = useState<GroupMember[] | null>(null);
  const [inventoryMembers, setInventoryMembers] = useState<GroupMember[] | null>(null);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  // Restore a decision draft snapshotted before a renewal redirect, then clear it (one-shot).
  useEffect(() => {
    const d = loadDraft<{ notes?: string; options?: { orderItems?: PurchaseLineItem[] } }>(`approval:${ticket.id}`);
    if (d) {
      if (typeof d.notes === "string") setNotes(d.notes);
      if (d.options?.orderItems) setOrderItems(d.options.orderItems);
      clearDraft(`approval:${ticket.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const willNotifyPurchasers =
    isPurchaseRequest &&
    (selectedAction === "Approved" || selectedAction === "Approved with Changes");
  const willNotifyOrderTeam = isPurchaseRequest && selectedAction === "Approved & Ordered";
  const showRecipientList = willNotifyPurchasers || willNotifyOrderTeam;

  // Lazy fetch: only call Graph for groups we actually need to display.
  useEffect(() => {
    if (!showRecipientList) return;
    if (!accounts[0]) return;

    const needPurchasers = willNotifyPurchasers && purchaserMembers === null;
    const needGMs = willNotifyOrderTeam && gmMembers === null;
    const needInventory = willNotifyOrderTeam && inventoryMembers === null;
    if (!needPurchasers && !needGMs && !needInventory) return;

    let cancelled = false;
    setRecipientsLoading(true);
    (async () => {
      try {
        const client = getGraphClient(instance, accounts[0]);
        const tasks: Promise<void>[] = [];
        if (needPurchasers) {
          tasks.push(
            getPurchaserMembers(client).then((m) => {
              if (!cancelled) setPurchaserMembers(m);
            }),
          );
        }
        if (needGMs) {
          tasks.push(
            getGeneralManagerMembers(client).then((m) => {
              if (!cancelled) setGmMembers(m);
            }),
          );
        }
        if (needInventory) {
          tasks.push(
            getInventoryMembers(client).then((m) => {
              if (!cancelled) setInventoryMembers(m);
            }),
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        console.error("Failed to fetch recipient members:", e);
      } finally {
        if (!cancelled) setRecipientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showRecipientList, willNotifyPurchasers, willNotifyOrderTeam, purchaserMembers, gmMembers, inventoryMembers, instance, accounts]);

  // Build the role-labeled recipient list for the current action. Deduped by
  // email — if the same person is both a GM and the requester, they appear once
  // with the most-specific role first (Requester > GM > Inventory).
  const approverEmail = (accounts[0]?.username || "").toLowerCase();
  const recipients: NotificationRecipient[] = (() => {
    if (!showRecipientList) return [];
    const seen = new Set<string>();
    const out: NotificationRecipient[] = [];
    const add = (email: string | undefined, displayName: string | undefined, role: string) => {
      if (!email) return;
      const key = email.toLowerCase();
      if (key === approverEmail) return; // skip the person doing the approving
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ email, displayName: displayName || email, role });
    };

    if (willNotifyPurchasers) {
      (purchaserMembers ?? []).forEach((m) => add(m.email, m.displayName, "Purchaser"));
    } else if (willNotifyOrderTeam) {
      // Requester first
      add(ticket.requester?.email, ticket.requester?.displayName, "Requester");
      // Then GMs (excluding the approver — the loop's `add` skips them)
      (gmMembers ?? []).forEach((m) => add(m.email, m.displayName, "General Manager"));
      // Then Inventory
      (inventoryMembers ?? []).forEach((m) => add(m.email, m.displayName, "Inventory"));
    }
    return out;
  })();

  const isPending = ticket.approvalStatus === "Pending";

  const handleActionSelect = (action: ApprovalDecision) => {
    setSelectedAction(action);
    setNotes("");
    setError(null);
    setKeptItemIndexes(new Set(ticket.purchaseLineItems?.map((_, i) => i) ?? []));
    setOrderItems(ticket.purchaseLineItems ?? []);
    setSameAsAbove(new Set());
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;

    // Guard: "Approved with Changes" on a purchase request must keep at least one item
    if (
      selectedAction === "Approved with Changes" &&
      isPurchaseRequest &&
      ticket.purchaseLineItems &&
      ticket.purchaseLineItems.length > 0 &&
      keptItemIndexes.size === 0
    ) {
      setError("At least one item must be kept. Use Deny to reject the request entirely.");
      return;
    }

    // Notes are required for Deny, Changes Requested, and Approved with Changes
    const requiresNotes =
      selectedAction === "Denied" ||
      selectedAction === "Changes Requested" ||
      selectedAction === "Approved with Changes";

    if (requiresNotes && !notes.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const finalOrderItems = orderItems.map((item, i) => {
        if (i === 0 || !sameAsAbove.has(i)) return item;
        return {
          ...item,
          vendor: orderItems[i - 1].vendor,
          orderNum: orderItems[i - 1].orderNum,
        };
      });

      const keptItems =
        selectedAction === "Approved with Changes" && ticket.purchaseLineItems
          ? ticket.purchaseLineItems.filter((_, i) => keptItemIndexes.has(i))
          : undefined;

      await onDecision(selectedAction, notes.trim() || undefined, {
        keptItems,
        orderItems: selectedAction === "Approved & Ordered" ? finalOrderItems : undefined,
      });
      setSelectedAction(null);
      setNotes("");
    } catch (err) {
      console.error("Failed to process approval:", err);
      setError("Failed to save approval decision. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedAction(null);
    setNotes("");
    setError(null);
    setKeptItemIndexes(new Set(ticket.purchaseLineItems?.map((_, i) => i) ?? []));
    setOrderItems(ticket.purchaseLineItems ?? []);
    setSameAsAbove(new Set());
  };

  const notesRequired =
    selectedAction === "Denied" ||
    selectedAction === "Changes Requested" ||
    selectedAction === "Approved with Changes";

  const getActionColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-100 text-green-800";
      case "Approved with Changes": return "bg-orange-100 text-orange-800";
      case "Approved & Ordered": return "bg-blue-100 text-blue-800";
      case "Denied": return "bg-red-100 text-red-800";
      case "Changes Requested": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getConfirmColor = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "bg-green-600 hover:bg-green-700";
      case "Approved with Changes": return "bg-orange-600 hover:bg-orange-700";
      case "Approved & Ordered": return "bg-blue-600 hover:bg-blue-700";
      case "Denied": return "bg-red-600 hover:bg-red-700";
      case "Changes Requested": return "bg-orange-600 hover:bg-orange-700";
      default: return "bg-gray-600 hover:bg-gray-700";
    }
  };

  const getPlaceholder = (action: ApprovalDecision) => {
    switch (action) {
      case "Approved": return "Add any notes for the approval...";
      case "Approved with Changes": return "Describe the approved changes...";
      case "Approved & Ordered": return "Add order details if applicable...";
      case "Denied": return "Please explain why this request is denied...";
      case "Changes Requested": return "Describe what changes are needed...";
      default: return "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          {isPending ? "Approval Decision" : "Approval Actions"}
        </h4>
        {isPending && (
          <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
            Awaiting Decision
          </span>
        )}
      </div>

      {isPurchaseRequest && ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
        <div className="border border-border rounded-lg bg-bg-subtle p-3">
          <div className="text-xs font-semibold text-text-secondary mb-2">
            Reviewing {ticket.purchaseLineItems.length} item{ticket.purchaseLineItems.length === 1 ? "" : "s"}
          </div>
          <LineItemsTable items={ticket.purchaseLineItems} compact />
        </div>
      )}

      {selectedAction ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-sm font-medium ${getActionColor(selectedAction)}`}>
              {selectedAction}
            </span>
          </div>

          {showRecipientList && (
            <div className="bg-white border border-blue-200 rounded p-2">
              <p className="text-xs font-semibold text-blue-900 mb-1">
                {willNotifyOrderTeam
                  ? "These users will be alerted that the order was placed:"
                  : "These users will be notified to initiate the purchase:"}
              </p>
              {recipientsLoading ? (
                <p className="text-xs text-text-secondary">Loading recipient list…</p>
              ) : recipients.length === 0 ? (
                <p className="text-xs text-orange-700">
                  No recipients found — no one will be notified. Check the relevant Entra ID groups.
                </p>
              ) : (
                <ul className="text-sm space-y-0.5">
                  {recipients.map((r) => (
                    <li key={r.email} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-text-primary">{r.displayName}</span>
                      <span className="text-[10px] uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                        {r.role}
                      </span>
                      <span className="text-xs text-text-secondary">{r.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedAction === "Approved with Changes" && isPurchaseRequest && ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0 && (
            <div className="bg-white border border-orange-200 rounded p-2 space-y-1">
              <p className="text-xs text-orange-800">Untick items to remove from the approval. Notes auto-fill below.</p>
              {ticket.purchaseLineItems.map((item, idx) => {
                const kept = keptItemIndexes.has(idx);
                return (
                  <label
                    key={idx}
                    className={`flex justify-between items-center text-sm ${kept ? "" : "line-through text-text-secondary"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={kept}
                        onChange={() => {
                          const next = new Set(keptItemIndexes);
                          if (kept) next.delete(idx); else next.add(idx);
                          setKeptItemIndexes(next);
                          setError(null);
                          // auto-fill notes based on what's removed/kept
                          const items = ticket.purchaseLineItems!;
                          const removed = items.filter((_, i) => !next.has(i));
                          const kept2 = items.filter((_, i) => next.has(i));
                          const removedSummary = removed.length
                            ? `Removed from order: ${removed.map((r) => `${r.name || r.url || "item"} (×${r.qty})`).join(", ")}.`
                            : "";
                          const total = kept2.reduce((s, r) => s + r.qty * r.cost, 0);
                          setNotes(`${removedSummary} Approved remaining ${kept2.length} item${kept2.length === 1 ? "" : "s"}, total $${total.toFixed(2)}.`.trim());
                        }}
                      />
                      {item.name || item.url || `Item ${idx + 1}`} × {item.qty}
                    </span>
                    <span>${(item.qty * item.cost).toFixed(2)}</span>
                  </label>
                );
              })}
            </div>
          )}

          {selectedAction === "Approved & Ordered" && isPurchaseRequest && orderItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-blue-800">Fill order details per item. Tick &quot;Same as above&quot; to copy vendor + order # from the previous row.</p>
              {orderItems.map((item, idx) => {
                const sameOn = sameAsAbove.has(idx);
                const aboveItem = idx > 0 ? orderItems[idx - 1] : null;
                const vendor = sameOn && aboveItem ? aboveItem.vendor ?? "" : item.vendor ?? "";
                const orderNum = sameOn && aboveItem ? aboveItem.orderNum ?? "" : item.orderNum ?? "";
                return (
                  <div key={idx} className="bg-white border border-blue-200 rounded p-2 space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <strong>{idx + 1}. {item.name || item.url || `Item ${idx + 1}`} × {item.qty} — est ${(item.qty * item.cost).toFixed(2)}</strong>
                      {idx > 0 && (
                        <label className="text-xs text-blue-700 flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={sameOn}
                            onChange={() => {
                              const next = new Set(sameAsAbove);
                              if (sameOn) next.delete(idx); else next.add(idx);
                              setSameAsAbove(next);
                              if (!sameOn && aboveItem) {
                                const updated = [...orderItems];
                                updated[idx] = { ...updated[idx], vendor: aboveItem.vendor, orderNum: aboveItem.orderNum };
                                setOrderItems(updated);
                              }
                            }}
                          />
                          Same vendor + order # as above
                        </label>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <input
                        type="text"
                        placeholder="Vendor"
                        value={vendor}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx] = { ...updated[idx], vendor: e.target.value };
                          setOrderItems(updated);
                        }}
                        disabled={sameOn}
                        className="px-2 py-1 border border-border rounded text-sm disabled:opacity-55"
                        aria-label={`Vendor for item ${idx + 1}`}
                      />
                      <input
                        type="text"
                        placeholder="Order #"
                        value={orderNum}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx] = { ...updated[idx], orderNum: e.target.value };
                          setOrderItems(updated);
                        }}
                        disabled={sameOn}
                        className="px-2 py-1 border border-border rounded text-sm disabled:opacity-55"
                        aria-label={`Order number for item ${idx + 1}`}
                      />
                      <input
                        type="number"
                        placeholder={`Actual $/ea (est $${item.cost.toFixed(2)})`}
                        value={item.actualCost ?? ""}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx] = { ...updated[idx], actualCost: e.target.value === "" ? undefined : parseFloat(e.target.value) };
                          setOrderItems(updated);
                        }}
                        step={0.01}
                        min={0}
                        className="px-2 py-1 border border-border rounded text-sm"
                        aria-label={`Actual cost for item ${idx + 1}`}
                      />
                      <input
                        type="date"
                        value={item.expectedDelivery ?? ""}
                        onChange={(e) => {
                          const updated = [...orderItems];
                          updated[idx] = { ...updated[idx], expectedDelivery: e.target.value };
                          setOrderItems(updated);
                        }}
                        className="px-2 py-1 border border-border rounded text-sm"
                        aria-label={`Expected delivery for item ${idx + 1}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Notes {notesRequired ? "(required)" : "(optional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={getPlaceholder(selectedAction)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={isLoading || (notesRequired && !notes.trim())}
              className={`flex-1 px-4 py-2 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getConfirmColor(selectedAction)}`}
            >
              {isLoading
                ? "Processing..."
                : selectedAction === "Approved & Ordered"
                  ? `Confirm Approve & Order (${orderItems.length} item${orderItems.length === 1 ? "" : "s"}, ${distinctVendorCount(orderItems)} vendor${distinctVendorCount(orderItems) === 1 ? "" : "s"})`
                  : `Confirm ${selectedAction}`}
            </button>
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}
        </div>
      ) : isPurchaseRequest ? (
        /* Purchase request: primary CTA + secondary chips */
        <div className="space-y-2">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {ticket.purchaseLineItems && ticket.purchaseLineItems.length > 0
              ? `Approve All ($${computeEstimatedTotal(ticket.purchaseLineItems).toFixed(0)})`
              : "Approve"}
          </button>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => handleActionSelect("Approved with Changes")}
              className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
            >
              w/ Changes
            </button>
            <button
              onClick={() => handleActionSelect("Approved & Ordered")}
              className="px-2 py-1.5 bg-white border border-blue-500 text-blue-600 text-xs rounded font-medium hover:bg-blue-50 transition-colors"
            >
              + Order
            </button>
            <button
              onClick={() => handleActionSelect("Denied")}
              className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ) : (
        /* Standard request: primary CTA + secondary chips */
        <div className="space-y-2">
          <button
            onClick={() => handleActionSelect("Approved")}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleActionSelect("Changes Requested")}
              className="px-2 py-1.5 bg-white border border-orange-500 text-orange-600 text-xs rounded font-medium hover:bg-orange-50 transition-colors"
            >
              Changes
            </button>
            <button
              onClick={() => handleActionSelect("Denied")}
              className="px-2 py-1.5 bg-white border border-red-500 text-red-600 text-xs rounded font-medium hover:bg-red-50 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
