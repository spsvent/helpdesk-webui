"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CDWBrief, isEditableCdwStatus } from "../types";
import { CDW_FIELDS } from "../fields";
import { validateBrief } from "../validation";
import { getCdw, submitForApproval, visibleCdw } from "../cdwService";
import CdwStatusBadge from "./CdwStatusBadge";
import CdwApprovalPanel from "./CdwApprovalPanel";

function personLine(name?: string, email?: string): string {
  if (!name && !email) return "";
  return email ? `${name || email} <${email}>` : name || "";
}

function displayValue(brief: CDWBrief, key: string): string {
  if (key === "projectManager") return personLine(brief.projectManagerName, brief.projectManagerEmail);
  if (key === "finalRecipient") return personLine(brief.finalRecipientName, brief.finalRecipientEmail);
  return (brief[key as keyof CDWBrief] as string | undefined) || "";
}

export default function CdwDetail({ id }: { id: string }) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { permissions, canApprove } = useRBAC();

  const [brief, setBrief] = useState<CDWBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const client = getGraphClient(instance, account);
      setBrief(await getCdw(client, id));
    } catch (e) {
      console.error("[CdwDetail] load failed:", e);
      setError("Could not load this brief.");
    } finally {
      setLoading(false);
    }
  }, [account, instance, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmitForApproval() {
    if (!account || !brief) return;
    // Guard: an incomplete brief (a draft can be saved with most fields blank)
    // must be completed before it can enter the GM approval queue.
    const invalid = validateBrief(brief);
    if (invalid) {
      setError(`${invalid} Edit the brief to complete it before submitting.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const client = getGraphClient(instance, account);
      const updated = await submitForApproval(client, brief.id, brief.requesterName);
      setBrief(updated);
    } catch (e) {
      console.error("[CdwDetail] submit failed:", e);
      setError("Could not submit for approval. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8"><LoadingSpinner /></div>;
  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!brief) return <p className="p-8 text-sm text-text-secondary">Brief not found.</p>;

  if (!visibleCdw(brief, permissions)) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-sm text-text-secondary">
          This brief isn’t available to you. It becomes visible once it’s approved.
        </p>
        <Link href="/cdw" className="mt-3 inline-block text-sm text-brand-primary underline">
          Back to briefs
        </Link>
      </div>
    );
  }

  const me = permissions?.email?.toLowerCase();
  const isOwner =
    !!me && [brief.createdByEmail, brief.requesterEmail].some((e) => e && e.toLowerCase() === me);
  // Edit/submit only while the brief is still in the requester's hands (Draft /
  // Changes Requested) — the same rule CdwForm enforces on the edit route.
  const canSubmit = isOwner && isEditableCdwStatus(brief.status);
  const showApproval = canApprove() && brief.status === "Pending Approval";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link href="/cdw" className="text-sm text-text-secondary hover:text-text-primary">← Briefs</Link>
        <CdwStatusBadge status={brief.status} />
      </div>

      <h1 className="mt-3 text-xl font-semibold text-text-primary">{brief.title}</h1>
      <p className="mt-1 text-xs text-text-secondary">
        Submitted by {brief.requesterName || brief.createdByName || "—"}
      </p>

      {showApproval && (
        <div className="mt-4">
          <CdwApprovalPanel brief={brief} onDecided={setBrief} />
        </div>
      )}

      {canSubmit && (
        <div className="mt-4 rounded-lg border border-border bg-bg-subtle p-4">
          <p className="text-sm text-text-primary">
            {brief.status === "Changes Requested"
              ? "Changes were requested. Edit the brief, then resubmit for approval."
              : "This brief is a draft. Edit or submit it for approval when ready."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/cdw/edit/?id=${brief.id}`}
              className="px-4 py-2 bg-bg-card text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40"
            >
              Edit brief
            </Link>
            <button
              type="button"
              onClick={handleSubmitForApproval}
              disabled={submitting}
              className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for Approval"}
            </button>
          </div>
        </div>
      )}

      {/* Approval outcome */}
      {(brief.status === "Approved" || brief.status === "Denied") && brief.approvedByName && (
        <div className="mt-4 rounded-lg border border-border p-4 text-sm">
          <p>
            <span className="font-medium">{brief.status}</span> by {brief.approvedByName}
            {brief.approvalDate ? ` on ${brief.approvalDate}` : ""}
          </p>
          {brief.approvalNotes && <p className="mt-1 text-text-secondary">“{brief.approvalNotes}”</p>}
        </div>
      )}

      {/* Worksheet */}
      <dl className="mt-6 divide-y divide-border border-t border-border">
        {CDW_FIELDS.filter((f) => f.key !== "title").map((f) => {
          const value = displayValue(brief, f.key);
          if (!value) return null;
          return (
            <div key={f.key} className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-1">
              <dt className="text-sm font-medium text-text-secondary">{f.label}</dt>
              <dd className="sm:col-span-2 text-sm text-text-primary whitespace-pre-wrap">{value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
