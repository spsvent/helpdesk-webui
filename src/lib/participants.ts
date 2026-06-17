// Pure participant resolution. Takes primitives only (no Ticket import) so it is
// trivially unit-testable and free of module-alias/DOM concerns.

export interface ParticipantInput {
  requesterEmail?: string;
  assigneeEmail?: string;
  approverEmail?: string;
  approvalRequesterEmail?: string;
  manualEmails?: string[];
  commenterEmails?: string[];
}

const clean = (e?: string): string | null => {
  if (!e || typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.length ? t : null;
};

// Parse a delimited ParticipantEmails column value into a clean email array.
export function parseParticipantEmails(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

// Serialize an email array back into the column's delimited form.
export function serializeParticipantEmails(emails: string[]): string {
  return emails.join("; ");
}

// Union all participant sources, lowercased + deduped, minus the actor.
export function collectParticipants(input: ParticipantInput, excludeEmail?: string): string[] {
  const out = new Set<string>();
  const add = (e?: string) => {
    const c = clean(e);
    if (c) out.add(c);
  };

  add(input.requesterEmail);
  add(input.assigneeEmail);
  add(input.approverEmail);
  add(input.approvalRequesterEmail);
  (input.manualEmails || []).forEach(add);
  (input.commenterEmails || []).forEach(add);

  const exclude = clean(excludeEmail);
  if (exclude) out.delete(exclude);
  return [...out];
}

// Keep only participants whose email appears in the staff set.
export function staffSubset(emails: string[], staffEmails: Iterable<string>): string[] {
  const staff = new Set<string>();
  for (const e of staffEmails) {
    const c = clean(e);
    if (c) staff.add(c);
  }
  return emails.filter((e) => staff.has(clean(e) || ""));
}
