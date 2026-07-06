// Shared Graph/SharePoint facade for form modules.
//
// Re-exports the genuinely list-agnostic primitives from graphClient.ts so a form
// module (e.g. CDW) depends on this stable surface instead of reaching deep into
// the ticket client. Nothing here is ticket-specific.
//
// ============================================================================
// IMPORT RULE (enforced by convention — this repo has no ESLint setup to encode
// it): code under src/modules/** imports Graph helpers from HERE
// ("@/shared/graph"), never from "@/lib/graphClient" directly. Ticket-specific
// helpers (getTicket, updateTicket, addComment, …) are intentionally not
// re-exported; the single sanctioned exception is PurchaseForm's
// convert-from-ticket bridge, which deep-imports them with a comment saying so.
// Before merging module changes: grep '@/lib/graphClient' under src/modules/.
// If a module needs another list-agnostic helper, add the re-export here.
// ============================================================================

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
export { fetchAllListItems } from "@/shared/listItems";
export type {
  SharePointListItem,
  SharePointListResponse,
} from "@/shared/spTypes";
export { getPersonDisplayName, getPersonEmail } from "@/shared/spTypes";
