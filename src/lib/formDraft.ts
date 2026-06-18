// Pure sessionStorage draft persistence. Storage is injectable so it's unit-testable
// in node (vitest 'node' env has no sessionStorage). Survives navigation/redirect.
export type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "helpdesk-draft:";

function defaultStore(): SessionLike | null {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : null;
}

export function saveDraft(key: string, value: unknown, store: SessionLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or non-serializable — drop silently */
  }
}

export function loadDraft<T = unknown>(key: string, store: SessionLike | null = defaultStore()): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, store: SessionLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
