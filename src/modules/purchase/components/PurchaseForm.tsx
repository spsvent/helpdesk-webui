"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getTicket, updateTicket, addComment } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import { saveDraft, loadDraft, clearDraft } from "@/lib/formDraft";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PurchaseLineItem } from "../types";
import { validateLineItem } from "../lineItems";
import { canCreatePurchase } from "../access";
import { createPurchase, isPurchaseConfigured, triggerPurchaseApprovalRequest } from "../purchaseService";
import LineItemsField from "./LineItemsField";

const DRAFT_KEY = "purchase-new";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tickets.spsvent.net";

interface SourceTicket {
  id: string;
  number?: number;
  requesterName: string;
  requesterEmail: string;
}

interface DraftShape {
  title: string;
  justification: string;
  project: string;
  lineItems: PurchaseLineItem[];
}

export default function PurchaseForm({ fromTicketId }: { fromTicketId?: string } = {}) {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions, loading: rbacLoading } = useRBAC();
  const account = accounts[0];
  const isConvert = !!fromTicketId;

  const [title, setTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [project, setProject] = useState("");
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([{ qty: 1, cost: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceTicket, setSourceTicket] = useState<SourceTicket | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(isConvert);

  // Restore a draft (new mode only — conversions prefill from the ticket instead).
  useEffect(() => {
    if (isConvert) return;
    const d = loadDraft<DraftShape>(DRAFT_KEY);
    if (d) {
      setTitle(d.title || "");
      setJustification(d.justification || "");
      setProject(d.project || "");
      if (d.lineItems?.length) setLineItems(d.lineItems);
    }
  }, [isConvert]);

  useEffect(() => {
    if (!isConvert) saveDraft(DRAFT_KEY, { title, justification, project, lineItems });
  }, [isConvert, title, justification, project, lineItems]);

  // Convert mode: load the source ticket and prefill from it.
  useEffect(() => {
    if (!fromTicketId || !account) return;
    (async () => {
      try {
        const client = getGraphClient(instance, account);
        const t = await getTicket(client, fromTicketId);
        setTitle(t.title);
        setJustification(t.description || "");
        setSourceTicket({ id: fromTicketId, number: t.ticketNumber, requesterName: t.requester.displayName, requesterEmail: t.requester.email });
      } catch (e) {
        console.error("[PurchaseForm] load ticket for convert failed:", e);
        setError("Could not load the ticket to convert.");
      } finally {
        setLoadingTicket(false);
      }
    })();
  }, [fromTicketId, account, instance]);

  function validate(): string | null {
    if (!title.trim()) return "A title is required.";
    const items = lineItems.filter((i) => i.name?.trim() || i.url?.trim());
    if (items.length === 0) return "Add at least one item (name or URL).";
    for (const it of items) {
      const err = validateLineItem(it);
      if (err) return err;
    }
    if (!justification.trim()) return "A justification is required.";
    return null;
  }

  async function handleSubmit() {
    const v = validate();
    if (v) return setError(v);
    if (!account) return setError("You must be signed in.");
    setError(null);
    setSubmitting(true);
    try {
      const client = getGraphClient(instance, account);
      const items = lineItems.filter((i) => i.name?.trim() || i.url?.trim());
      const pr = await createPurchase(client, {
        title: title.trim(),
        justification: justification.trim(),
        project: project.trim() || undefined,
        // Converted requests keep the original ticket's requester; otherwise the submitter.
        requesterName: sourceTicket?.requesterName || account.name || account.username || "",
        requesterEmail: sourceTicket?.requesterEmail || account.username || "",
        approvalRequestedDate: new Date().toISOString().slice(0, 10),
        sourceTicketId: sourceTicket?.id,
        sourceTicketNumber: sourceTicket?.number,
        lineItems: items,
      });
      await triggerPurchaseApprovalRequest(pr.id, pr.requesterName);

      // Convert: resolve the source ticket and link it to the new PR (best-effort).
      // Comments are keyed by the ticket's item id (getComments is called with
      // parseInt(ticket.id)), NOT TicketNumber — so key the linking comment the same
      // way, or it won't show on the ticket (and would be skipped entirely for tickets
      // that have no TicketNumber).
      if (sourceTicket) {
        try {
          await updateTicket(client, sourceTicket.id, { Status: "Resolved" });
          await addComment(client, parseInt(sourceTicket.id, 10), `🛒 Converted to a Purchase Request — ${APP_URL}/purchase?id=${pr.id}`, false);
        } catch (e) {
          console.error("[PurchaseForm] resolving/commenting source ticket failed (non-blocking):", e);
        }
      }

      clearDraft(DRAFT_KEY);
      router.push(`/purchase/?id=${pr.id}`);
    } catch (e) {
      console.error("[PurchaseForm] submit failed:", e);
      setError("Could not submit the purchase request. Please try again.");
      setSubmitting(false);
    }
  }

  if (rbacLoading || loadingTicket) return <div className="p-8"><LoadingSpinner /></div>;
  if (!isPurchaseConfigured()) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">
        Purchase requests aren’t set up yet. An administrator needs to create the PurchaseRequests list.
        <Link href="/purchase" className="mt-3 block text-brand-primary underline">Back</Link>
      </div>
    );
  }
  if (!canCreatePurchase(permissions)) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">You don’t have permission to create purchase requests.</div>;
  }

  const inputClass = "w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary">
        {isConvert ? "Convert to Purchase Request" : "New Purchase Request"}
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        {isConvert && sourceTicket?.number != null
          ? `From ticket #${sourceTicket.number}. Add the items needed and submit — the original ticket will be resolved and linked to this request.`
          : "Add the items you need and submit for approval. Once a General Manager approves it, the purchasing team can order it."}
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="pr-title" className="block text-sm font-medium text-text-primary">Title <span className="text-red-500">*</span></label>
          <input id="pr-title" className={`mt-1 ${inputClass}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this purchase for?" />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary">Items <span className="text-red-500">*</span></label>
          <div className="mt-1"><LineItemsField items={lineItems} onChange={setLineItems} /></div>
        </div>

        <div>
          <label htmlFor="pr-just" className="block text-sm font-medium text-text-primary">Justification <span className="text-red-500">*</span></label>
          <textarea id="pr-just" rows={3} className={`mt-1 ${inputClass}`} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why is this needed?" />
        </div>

        <div>
          <label htmlFor="pr-proj" className="block text-sm font-medium text-text-primary">Project</label>
          <input id="pr-proj" className={`mt-1 ${inputClass}`} value={project} onChange={(e) => setProject(e.target.value)} placeholder="Optional project / budget code" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}
