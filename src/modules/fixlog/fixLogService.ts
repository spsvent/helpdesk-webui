// Quick Fix Log data service — talks only to the module's own two SharePoint
// lists (QuickFixLog + QuickFixIssues). Never touches the Tickets list, never
// sends email/Teams/To Do, never writes the ActivityLog.

import { Client } from "@microsoft/microsoft-graph-client";
import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import {
  fetchAllListItems,
  getSharePointToken,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
} from "@/shared/graph";
import type { SharePointListItem } from "@/shared/graph";
import type { Attachment } from "@/types/ticket";
import {
  FixLogEntry,
  FixLogWritable,
  FixLogIssue,
  FixLogIssueWritable,
  FIXLOG_COLUMN_MAP,
  FIXLOG_ISSUE_COLUMN_MAP,
  mapToFixLogEntry,
  mapToFixLogIssue,
} from "./types";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const ENTRIES_LIST_ID = process.env.NEXT_PUBLIC_FIXLOG_LIST_ID || "";
const ISSUES_LIST_ID = process.env.NEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID || "";
// Same default as graphClient's attachment helpers, so photo uploads and the
// strict photo listing below always talk to the same site.
const SHAREPOINT_SITE_URL =
  process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL || "https://skyparksv.sharepoint.com/sites/helpdesk";

export function isFixLogConfigured(): boolean {
  return !!ENTRIES_LIST_ID;
}

export function isFixLogIssuesConfigured(): boolean {
  return !!ISSUES_LIST_ID;
}

function toFields<K extends string>(w: Partial<Record<K, unknown>>, map: Record<K, string>) {
  const fields: Record<string, unknown> = {};
  (Object.keys(w) as K[]).forEach((k) => {
    const value = w[k];
    if (value !== undefined) fields[map[k]] = value;
  });
  return fields;
}

const itemsUrl = (listId: string) => `/sites/${SITE_ID}/lists/${listId}/items`;

function requireEntries() {
  if (!ENTRIES_LIST_ID) throw new Error("Quick Fix Log list is not configured (NEXT_PUBLIC_FIXLOG_LIST_ID)");
}
function requireIssues() {
  if (!ISSUES_LIST_ID)
    throw new Error("Quick Fix issues list is not configured (NEXT_PUBLIC_FIXLOG_ISSUES_LIST_ID)");
}

// --- entries -----------------------------------------------------------------

/**
 * Entries with FixedAt on/after `sinceIso` (all of them when omitted), newest first.
 * FixedAt is an indexed column; the Prefer header keeps the filter working even
 * if the index is ever dropped. Follows @odata.nextLink to the end.
 */
export async function listEntries(client: Client, sinceIso?: string): Promise<FixLogEntry[]> {
  if (!ENTRIES_LIST_ID) return [];
  let endpoint = `${itemsUrl(ENTRIES_LIST_ID)}?$expand=fields&$top=500`;
  if (sinceIso) {
    // SharePoint compares against second-precision UTC ("…:00Z").
    const since = new Date(sinceIso).toISOString().replace(/\.\d{3}Z$/, "Z");
    endpoint += `&$filter=${encodeURIComponent(`fields/FixedAt ge '${since}'`)}`;
  }
  const items = await fetchAllWithPrefer(client, endpoint);
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : undefined;
  return items
    .map(mapToFixLogEntry)
    .filter((e) => (sinceMs === undefined ? true : new Date(e.fixedAt).getTime() >= sinceMs))
    .sort((a, b) => new Date(b.fixedAt).getTime() - new Date(a.fixedAt).getTime());
}

// fetchAllListItems, plus the Prefer header the FixedAt filter may need.
async function fetchAllWithPrefer(client: Client, endpoint: string): Promise<SharePointListItem[]> {
  const out: SharePointListItem[] = [];
  let url = endpoint;
  for (;;) {
    const res = await client
      .api(url)
      .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
      .get();
    out.push(...(res.value || []));
    if (!res["@odata.nextLink"]) break;
    url = res["@odata.nextLink"];
  }
  return out;
}

export async function getEntry(client: Client, id: string): Promise<FixLogEntry> {
  requireEntries();
  const item = await client.api(`${itemsUrl(ENTRIES_LIST_ID)}/${id}?$expand=fields`).get();
  return mapToFixLogEntry(item);
}

export async function createEntry(client: Client, input: FixLogWritable): Promise<FixLogEntry> {
  requireEntries();
  const created = await client
    .api(itemsUrl(ENTRIES_LIST_ID))
    .post({ fields: toFields(input, FIXLOG_COLUMN_MAP) });
  // The item exists now. If only the re-read fails, use the POST response rather
  // than throwing — a thrown error here invites a second, duplicate POST.
  return getEntry(client, created.id).catch(() => mapToFixLogEntry(created));
}

export async function updateEntry(client: Client, id: string, patch: FixLogWritable): Promise<FixLogEntry> {
  requireEntries();
  await client
    .api(`${itemsUrl(ENTRIES_LIST_ID)}/${id}`)
    .patch({ fields: toFields(patch, FIXLOG_COLUMN_MAP) });
  return getEntry(client, id);
}

export async function deleteEntry(client: Client, id: string): Promise<void> {
  requireEntries();
  await client.api(`${itemsUrl(ENTRIES_LIST_ID)}/${id}`).delete();
}

// --- photos (SharePoint attachments on the entry) ------------------------------

/**
 * The entry's photos. Unlike the shared getAttachments (which returns [] on ANY
 * error, including a 401), this throws on failure: PhotoCount and the retention
 * cleanup are computed from it, so "couldn't read" must never look like "none".
 */
export async function listEntryPhotos(
  _client: Client,
  id: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Attachment[]> {
  requireEntries();
  // Never acquire a SharePoint token for anything but an absolute https site URL.
  if (!/^https:\/\//.test(SHAREPOINT_SITE_URL))
    throw new Error("NEXT_PUBLIC_SHAREPOINT_SITE_URL must be an https URL");
  const token = await getSharePointToken(instance, account);
  const res = await fetch(
    `${SHAREPOINT_SITE_URL}/_api/web/lists(guid'${ENTRIES_LIST_ID}')/items(${id})/AttachmentFiles`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose" } }
  );
  if (!res.ok) throw new Error(`Couldn't read photos for entry ${id} (${res.status})`);
  const data = await res.json();
  const results = data?.d?.results;
  // An unexpected body must not read as "no photos".
  if (!Array.isArray(results)) throw new Error(`Unexpected photo listing for entry ${id}`);
  return (results as Record<string, unknown>[]).map((a) => ({
    name: a.FileName as string,
    contentType: "application/octet-stream",
    size: 0,
    contentUrl: (a.ServerRelativeUrl as string) || "",
  }));
}

export function uploadEntryPhoto(
  client: Client,
  id: string,
  file: File,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Attachment | null> {
  // The shared helpers fall back to the Tickets list when listId is empty.
  requireEntries();
  return uploadAttachment(client, id, file, instance, account, ENTRIES_LIST_ID);
}

export function deleteEntryPhoto(
  client: Client,
  id: string,
  filename: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<boolean> {
  requireEntries();
  return deleteAttachment(client, id, filename, instance, account, ENTRIES_LIST_ID);
}

export function downloadEntryPhoto(
  client: Client,
  id: string,
  filename: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Blob | null> {
  requireEntries();
  return downloadAttachment(client, id, filename, instance, account, ENTRIES_LIST_ID);
}

/**
 * Re-read the entry's attachments and store the real count in PhotoCount. The
 * list view and the retention cleanup rely on PhotoCount, so it is always set
 * from SharePoint's answer rather than incremented locally.
 */
export async function syncPhotoCount(
  client: Client,
  id: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<number> {
  const photos = await listEntryPhotos(client, id, instance, account);
  await updateEntry(client, id, { photoCount: photos.length });
  return photos.length;
}

/**
 * Delete every photo on an entry and re-sync PhotoCount. Throws if any photo is
 * still there afterwards, so the retention cleanup reports it as a failure.
 */
export async function deleteAllEntryPhotos(
  client: Client,
  id: string,
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<void> {
  const photos = await listEntryPhotos(client, id, instance, account);
  for (const p of photos) {
    // deleteAttachment reports failure as false rather than throwing.
    if (!(await deleteEntryPhoto(client, id, p.name, instance, account)))
      throw new Error(`Couldn't delete photo ${p.name} on entry ${id}`);
  }
  const remaining = await syncPhotoCount(client, id, instance, account);
  if (remaining > 0) throw new Error(`${remaining} photo(s) on entry ${id} could not be deleted`);
}

// --- common issues ---------------------------------------------------------------

export async function listIssues(
  client: Client,
  opts?: { includeInactive?: boolean }
): Promise<FixLogIssue[]> {
  if (!ISSUES_LIST_ID) return [];
  const items = await fetchAllListItems(client, `${itemsUrl(ISSUES_LIST_ID)}?$expand=fields&$top=500`);
  const mapped = items.map(mapToFixLogIssue);
  return opts?.includeInactive ? mapped : mapped.filter((i) => i.active);
}

export async function createIssue(client: Client, input: FixLogIssueWritable): Promise<FixLogIssue> {
  requireIssues();
  const created = await client
    .api(itemsUrl(ISSUES_LIST_ID))
    .post({ fields: toFields(input, FIXLOG_ISSUE_COLUMN_MAP) });
  return client
    .api(`${itemsUrl(ISSUES_LIST_ID)}/${created.id}?$expand=fields`)
    .get()
    .then(mapToFixLogIssue)
    .catch(() => mapToFixLogIssue(created));
}

export async function updateIssue(
  client: Client,
  id: string,
  patch: FixLogIssueWritable
): Promise<FixLogIssue> {
  requireIssues();
  await client
    .api(`${itemsUrl(ISSUES_LIST_ID)}/${id}`)
    .patch({ fields: toFields(patch, FIXLOG_ISSUE_COLUMN_MAP) });
  const item = await client.api(`${itemsUrl(ISSUES_LIST_ID)}/${id}?$expand=fields`).get();
  return mapToFixLogIssue(item);
}

export async function deleteIssue(client: Client, id: string): Promise<void> {
  requireIssues();
  await client.api(`${itemsUrl(ISSUES_LIST_ID)}/${id}`).delete();
}
