// Shared Graph/SharePoint facade for form modules.
//
// Re-exports the genuinely list-agnostic primitives from graphClient.ts so a form
// module (e.g. CDW) depends on this stable surface instead of reaching deep into
// the ticket client. Nothing here is ticket-specific.

export {
  // Auth + client
  getGraphClient,
  getSharePointToken,
  getSiteUserId,
  // People / groups (used by pickers + notifications)
  searchUsers,
  searchGroups,
  searchUsersAndGroups,
  getUserByEmail,
  getCurrentUser,
  getUserPhoto,
  getSharePointUserLookupId,
  // Email
  sendEmail,
  // List-aware attachments (pass a listId to target a non-Tickets list)
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
} from "@/lib/graphClient";

export { ensureList } from "@/shared/ensureList";
export type { SharePointColumnDef } from "@/shared/ensureList";
export type {
  SharePointListItem,
  SharePointListResponse,
} from "@/shared/spTypes";
export { getPersonDisplayName, getPersonEmail } from "@/shared/spTypes";
