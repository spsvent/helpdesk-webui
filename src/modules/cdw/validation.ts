// Pure CDW form validation + form-state mapping, extracted from CdwForm so they
// can be unit-tested.

import { CDW_FIELDS } from "./fields";
import type { CDWBrief, CdwWritable } from "./types";

export type CdwFormValues = Record<string, string>;
export type CdwFormPersons = Record<string, { displayName: string; email: string } | null>;

/**
 * Build the SharePoint write payload from the form state (field payload only — no
 * requester: that's set once at creation, never overwritten on edit).
 * - Create (isEdit=false): empty fields are omitted, so a new item only writes what
 *   was filled in.
 * - Edit (isEdit=true): emptied fields (and removed persons) are written as null so
 *   the stored column actually clears — omitting them would silently keep the old
 *   SharePoint value. (null-to-clear matches the graphClient.ts convention.)
 */
export function buildCdwPayload(
  values: CdwFormValues,
  persons: CdwFormPersons,
  isEdit: boolean
): CdwWritable {
  const payload: CdwWritable = {};
  const record = payload as Record<string, unknown>;
  for (const f of CDW_FIELDS) {
    if (f.type === "person") continue;
    const v = values[f.key]?.trim();
    if (v) record[f.key] = v;
    else if (isEdit) record[f.key] = null;
  }
  const pm = persons.projectManager;
  if (pm) {
    payload.projectManagerName = pm.displayName;
    payload.projectManagerEmail = pm.email;
  } else if (isEdit) {
    payload.projectManagerName = null;
    payload.projectManagerEmail = null;
  }
  const fr = persons.finalRecipient;
  if (fr) {
    payload.finalRecipientName = fr.displayName;
    payload.finalRecipientEmail = fr.email;
  } else if (isEdit) {
    payload.finalRecipientName = null;
    payload.finalRecipientEmail = null;
  }
  return payload;
}

// Hydrate the editable form state from an existing brief (for the edit path).
export function briefToFormState(brief: Partial<CDWBrief>): {
  values: CdwFormValues;
  persons: CdwFormPersons;
} {
  const values: CdwFormValues = {};
  const record = brief as Record<string, unknown>;
  for (const f of CDW_FIELDS) {
    if (f.type === "person") continue;
    const v = record[f.key];
    if (typeof v === "string") values[f.key] = v;
  }
  const person = (name?: string, email?: string) =>
    name || email ? { displayName: name || "", email: email || "" } : null;
  const persons: CdwFormPersons = {
    projectManager: person(brief.projectManagerName, brief.projectManagerEmail),
    finalRecipient: person(brief.finalRecipientName, brief.finalRecipientEmail),
  };
  return { values, persons };
}

// Validate a loaded brief against the submit rules (used before submitting an
// existing draft / changes-requested brief from the detail page).
export function validateBrief(brief: CDWBrief): string | null {
  const { values, persons } = briefToFormState(brief);
  return validateCdw(values, persons, true);
}

/**
 * Validate the CDW form. Returns the first error message, or null when valid.
 * - Draft (forSubmit=false): only Project Name is required.
 * - Submit (forSubmit=true): every field marked required in CDW_FIELDS must be set
 *   (person fields require an email).
 */
export function validateCdw(
  values: CdwFormValues,
  persons: CdwFormPersons,
  forSubmit: boolean
): string | null {
  if (!values.title?.trim()) return "Project Name is required.";
  if (!forSubmit) return null;
  for (const f of CDW_FIELDS) {
    if (!f.required) continue;
    if (f.type === "person") {
      if (!persons[f.key]?.email) return `${f.label} is required.`;
    } else if (!values[f.key]?.trim()) {
      return `${f.label} is required.`;
    }
  }
  return null;
}
