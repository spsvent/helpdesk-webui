"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { saveDraft, loadDraft, clearDraft } from "@/lib/formDraft";
import UserSearchDropdown from "@/components/UserSearchDropdown";
import AttachmentUpload from "@/components/AttachmentUpload";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CDW_FIELDS } from "../fields";
import { CdwWritable } from "../types";
import { validateCdw, briefToFormState } from "../validation";
import { createCdw, getCdw, updateCdw, submitForApproval, uploadCdwAttachment } from "../cdwService";

const DRAFT_KEY = "cdw-new";

type Person = { displayName: string; email: string } | null;

interface DraftShape {
  values: Record<string, string>;
  persons: Record<string, Person>;
}

// Without briefId this is the "new brief" form; with one it edits an existing brief.
export default function CdwForm({ briefId }: { briefId?: string }) {
  const router = useRouter();
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const isEdit = !!briefId;

  const [values, setValues] = useState<Record<string, string>>({});
  const [persons, setPersons] = useState<Record<string, Person>>({});
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(isEdit);

  // Edit mode: hydrate from the existing brief. New mode: one-shot draft restore.
  useEffect(() => {
    if (isEdit) {
      if (!account) return;
      (async () => {
        try {
          const client = getGraphClient(instance, account);
          const { values: v, persons: p } = briefToFormState(await getCdw(client, briefId!));
          setValues(v);
          setPersons(p);
        } catch (e) {
          console.error("[CdwForm] load for edit failed:", e);
          setError("Could not load this brief for editing.");
        } finally {
          setLoadingBrief(false);
        }
      })();
      return;
    }
    const draft = loadDraft<DraftShape>(DRAFT_KEY);
    if (draft) {
      setValues(draft.values || {});
      setPersons(draft.persons || {});
    }
  }, [isEdit, briefId, account, instance]);

  // Persist new-brief work so an accidental navigation doesn't lose it. (Edits go
  // straight to the list item, so no draft is kept for them.)
  useEffect(() => {
    if (!isEdit) saveDraft(DRAFT_KEY, { values, persons });
  }, [isEdit, values, persons]);

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const setPerson = (key: string, p: Person) => setPersons((prev) => ({ ...prev, [key]: p }));

  // Field payload only (no requester — that's set once at creation, never overwritten on edit).
  function buildPayload(): CdwWritable {
    const payload: CdwWritable = {};
    for (const f of CDW_FIELDS) {
      if (f.type === "person") continue;
      const v = values[f.key]?.trim();
      if (v) (payload as Record<string, unknown>)[f.key] = v;
    }
    const pm = persons.projectManager;
    if (pm) {
      payload.projectManagerName = pm.displayName;
      payload.projectManagerEmail = pm.email;
    }
    const fr = persons.finalRecipient;
    if (fr) {
      payload.finalRecipientName = fr.displayName;
      payload.finalRecipientEmail = fr.email;
    }
    return payload;
  }

  async function handleSave(forSubmit: boolean) {
    const validationError = validateCdw(values, persons, forSubmit);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!account) {
      setError("You must be signed in.");
      return;
    }
    setError(null);
    setSaving(forSubmit ? "submit" : "draft");
    try {
      const client = getGraphClient(instance, account);
      const payload = buildPayload();

      let id = briefId;
      if (isEdit) {
        await updateCdw(client, briefId!, payload);
      } else {
        const created = await createCdw(client, {
          ...payload,
          requesterName: account.name || account.username || "",
          requesterEmail: account.username || "",
        });
        id = created.id;
      }

      // Best-effort: upload any staged reference files to the brief.
      for (const file of stagedFiles) {
        await uploadCdwAttachment(client, id!, file, instance, account).catch((e) =>
          console.error("[CdwForm] attachment upload failed:", e)
        );
      }

      if (forSubmit) {
        await submitForApproval(client, id!, account.name || account.username || "");
      }
      if (!isEdit) clearDraft(DRAFT_KEY);
      router.push(`/cdw/?id=${id}`);
    } catch (e) {
      console.error("[CdwForm] save failed:", e);
      setError("Could not save the brief. Please try again.");
      setSaving(null);
    }
  }

  const inputClass =
    "w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary";

  if (loadingBrief) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary">
        {isEdit ? "Edit Creative Brief (CDW)" : "New Creative Brief (CDW)"}
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Fill out the worksheet and submit for approval. Once a General Manager approves it, the brief
        becomes public and the named recipient is notified that they will receive the final.
      </p>

      <div className="mt-6 space-y-5">
        {CDW_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`cdw-${f.key}`} className="block text-sm font-medium text-text-primary">
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </label>
            {f.help && <p className="mt-0.5 text-xs text-text-secondary">{f.help}</p>}
            <div className="mt-1">
              {f.type === "person" ? (
                <UserSearchDropdown
                  value={persons[f.key] ?? null}
                  onChange={(u) => setPerson(f.key, u ? { displayName: u.displayName, email: u.email } : null)}
                  placeholder="Search for a person…"
                />
              ) : f.type === "textarea" ? (
                <textarea
                  id={`cdw-${f.key}`}
                  rows={3}
                  className={inputClass}
                  value={values[f.key] || ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  id={`cdw-${f.key}`}
                  type={f.type === "date" ? "date" : "text"}
                  className={inputClass}
                  value={values[f.key] || ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          </div>
        ))}

        {/* Optional reference files */}
        <div>
          <label className="block text-sm font-medium text-text-primary">Reference Files</label>
          <p className="mt-0.5 text-xs text-text-secondary">Optional — attach any reference material for the designer.</p>
          <div className="mt-1">
            <AttachmentUpload
              onUpload={async (file) => {
                setStagedFiles((prev) => [...prev, file]);
                return true;
              }}
            />
            {stagedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {stagedFiles.map((file, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-bg-subtle rounded px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-text-secondary hover:text-red-600 ml-2"
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving !== null}
            className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-colors disabled:opacity-50"
          >
            {saving === "submit" ? "Submitting…" : "Submit for Approval"}
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving !== null}
            className="px-4 py-2 bg-bg-subtle text-text-primary text-sm rounded-lg font-medium border border-border hover:bg-border/40 transition-colors disabled:opacity-50"
          >
            {saving === "draft" ? "Saving…" : "Save as Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
