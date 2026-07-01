"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, getTicket, updateTicket, addComment } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import { saveDraft, loadDraft, clearDraft } from "@/lib/formDraft";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PurchaseLineItem, PurchaseRequest } from "../types";
import { validateLineItem } from "../lineItems";
import { canCreatePurchase, canEditPurchase, isPurchaseEditable } from "../access";
import {
  createPurchase,
  getPurchase,
  isPurchaseConfigured,
  submitForApproval,
  triggerPurchaseApprovalRequest,
  updateLineItems,
  updatePurchase,
} from "../purchaseService";
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

// Without purchaseId this is the "new request" form (optionally prefilled from a
// ticket via fromTicketId); with one it edits an existing request (Fix for the
// "Changes Requested" dead end — edit, then resubmit for approval).
export default function PurchaseForm({ fromTicketId, purchaseId }: { fromTicketId?: string; purchaseId?: string } = {}) {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const { permissions, loading: rbacLoading } = useRBAC();
  const account = accounts[0];
  const isConvert = !!fromTicketId;
  const isEdit = !!purchaseId;

  const [title, setTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [project, setProject] = useState("");
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([{ qty: 1, cost: 0 }]);
  const [submitting, setSubmitting] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  // Non-fatal: the request saved/submitted but the approver email didn't go out.
  // Holds the saved request's id so the warning can link to its detail page.
  const [emailWarningId, setEmailWarningId] = useState<string | null>(null);
  const [sourceTicket, setSourceTicket] = useState<SourceTicket | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(isConvert || isEdit);
  // The request being edited, for the ownership/status authorization checks.
  const [editTarget, setEditTarget] = useState<PurchaseRequest | null>(null);

  // Restore a draft (new mode only — conversions prefill from the ticket, edits
  // hydrate from the existing request instead).
  useEffect(() => {
    if (isConvert || isEdit) return;
    const d = loadDraft<DraftShape>(DRAFT_KEY);
    if (d) {
      setTitle(d.title || "");
      setJustification(d.justification || "");
      setProject(d.project || "");
      if (d.lineItems?.length) setLineItems(d.lineItems);
    }
  }, [isConvert, isEdit]);

  useEffect(() => {
    if (!isConvert && !isEdit) saveDraft(DRAFT_KEY, { title, justification, project, lineItems });
  }, [isConvert, isEdit, title, justification, project, lineItems]);

  // Edit mode: hydrate from the existing request.
  useEffect(() => {
    if (!purchaseId || !account) return;
    (async () => {
      try {
        const client = getGraphClient(instance, account);
        const pr = await getPurchase(client, purchaseId);
        setEditTarget(pr);
        setTitle(pr.title);
        setJustification(pr.justification || "");
        setProject(pr.project || "");
        setLineItems(pr.lineItems.length ? pr.lineItems : [{ qty: 1, cost: 0 }]);
      } catch (e) {
        console.error("[PurchaseForm] load for edit failed:", e);
        setError("Could not load this request for editing.");
      } finally {
        setLoadingTicket(false);
      }
    })();
  }, [purchaseId, account, instance]);

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

  // resubmit=false (edit mode only) saves the changes without re-entering the
  // approval queue — the owner can keep revising and resubmit from the detail page.
  async function handleSubmit(resubmit = true) {
    const v = validate();
    if (v) return setError(v);
    if (!account) return setError("You must be signed in.");
    setError(null);
    setEmailWarningId(null);
    setSubmitting(resubmit ? "submit" : "save");
    try {
      const client = getGraphClient(instance, account);
      const items = lineItems.filter((i) => i.name?.trim() || i.url?.trim());

      // Edit mode: save field + line-item changes onto the existing record, then
      // optionally resubmit (submitForApproval flips it back to Pending and
      // re-triggers the approver email).
      if (isEdit) {
        await updatePurchase(client, purchaseId!, {
          title: title.trim(),
          justification: justification.trim(),
          project: project.trim() || undefined,
        });
        await updateLineItems(client, purchaseId!, items);
        if (resubmit) {
          const { emailSent } = await submitForApproval(
            client,
            purchaseId!,
            editTarget?.requesterName || account.name || account.username || ""
          );
          if (!emailSent) {
            // The save + resubmit landed; only the approver email failed. Stay here
            // so the warning is seen (navigating would drop it) and point at the
            // detail page's re-send affordance.
            setEmailWarningId(purchaseId!);
            setSubmitting(null);
            return;
          }
        }
        router.push(`/purchase/?id=${purchaseId}`);
        return;
      }

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
      const emailSent = await triggerPurchaseApprovalRequest(pr.id, pr.requesterName);

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
      if (!emailSent) {
        // The request was created; only the approver email failed. Stay here so the
        // warning is seen and point at the detail page's re-send affordance.
        setEmailWarningId(pr.id);
        setSubmitting(null);
        return;
      }
      router.push(`/purchase/?id=${pr.id}`);
    } catch (e) {
      console.error("[PurchaseForm] submit failed:", e);
      setError(isEdit ? "Could not save the purchase request. Please try again." : "Could not submit the purchase request. Please try again.");
      setSubmitting(null);
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
  if (!isEdit && !canCreatePurchase(permissions)) {
    return <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">You don’t have permission to create purchase requests.</div>;
  }

  // Editing requires ownership AND an editable status (Pending/Approved/Denied
  // requests are immutable — see isPurchaseEditable).
  if (isEdit && editTarget && (!canEditPurchase(editTarget, permissions) || !isPurchaseEditable(editTarget))) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-sm text-text-secondary">
        {canEditPurchase(editTarget, permissions)
          ? "This request can’t be edited in its current status."
          : "You can only edit your own purchase requests."}
        <Link href={`/purchase/?id=${purchaseId}`} className="mt-3 block text-brand-primary underline">Back</Link>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary">
        {isEdit ? "Edit Purchase Request" : isConvert ? "Convert to Purchase Request" : "New Purchase Request"}
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        {isEdit
          ? "Update the request, then resubmit it for approval (or save your changes and resubmit later from the request page)."
          : isConvert && sourceTicket?.number != null
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

        {emailWarningId && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p>
              Submitted — but the approval email could not be sent. Use “Re-send approval request” on
              the request page.
            </p>
            <Link href={`/purchase/?id=${emailWarningId}`} className="mt-1 inline-block font-medium underline">
              Go to the request
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting !== null}
            className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
          >
            {submitting === "submit"
              ? isEdit ? "Resubmitting…" : "Submitting…"
              : isEdit ? "Save & Resubmit for Approval" : "Submit for Approval"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting !== null}
              className="px-4 py-2 bg-bg-subtle text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              {submitting === "save" ? "Saving…" : "Save without Resubmitting"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
