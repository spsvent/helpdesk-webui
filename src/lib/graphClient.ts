import { Client } from "@microsoft/microsoft-graph-client";
import { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { graphScopes, sharepointScopes } from "./msalConfig";
import {
  Ticket,
  Comment,
  Attachment,
  SharePointListResponse,
  mapToTicket,
  mapToComment,
} from "@/types/ticket";

// SharePoint site and list IDs - configure in .env.local
const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TICKETS_LIST_ID = process.env.NEXT_PUBLIC_TICKETS_LIST_ID || "";
const COMMENTS_LIST_ID = process.env.NEXT_PUBLIC_COMMENTS_LIST_ID || "";

// SharePoint site URL for REST API calls (attachments)
const SHAREPOINT_SITE_URL = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL || "https://skyparksv.sharepoint.com/sites/helpdesk";

// Create authenticated Graph client
export function getGraphClient(
  msalInstance: IPublicClientApplication,
  account: AccountInfo
): Client {
  return Client.init({
    authProvider: async (done) => {
      try {
        const response = await msalInstance.acquireTokenSilent({
          ...graphScopes,
          account,
        });
        done(null, response.accessToken);
      } catch (error) {
        // Don't redirect - just fail gracefully
        // User can sign out and back in to get new token with updated scopes
        console.error("Token acquisition failed. Try signing out and back in.", error);
        done(error as Error, null);
      }
    },
  });
}

// Archive threshold: 90 days
const ARCHIVE_DAYS = 90;

function getArchiveDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - ARCHIVE_DAYS);
  return date.toISOString();
}

// Fetch active tickets (excludes resolved/closed older than 90 days)
export async function getTickets(client: Client): Promise<Ticket[]> {
  // Fetch all tickets without server-side filtering (Status column not indexed)
  // We'll filter client-side for better reliability
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=500&$orderby=createdDateTime desc`;

  const response: SharePointListResponse = await client.api(endpoint).get();
  const allTickets = response.value.map(mapToTicket);

  // Filter client-side: show all active tickets + recently resolved/closed (last 90 days)
  const archiveDate = new Date();
  archiveDate.setDate(archiveDate.getDate() - ARCHIVE_DAYS);

  return allTickets.filter((ticket) => {
    const isResolved = ticket.status === "Resolved" || ticket.status === "Closed";
    if (!isResolved) {
      return true; // Always show active tickets
    }
    // For resolved/closed, only show if created within last 90 days
    const createdDate = new Date(ticket.created);
    return createdDate >= archiveDate;
  });
}

// Fetch archived tickets (resolved/closed older than 90 days)
export async function getArchivedTickets(client: Client): Promise<Ticket[]> {
  // Fetch all tickets and filter for old resolved/closed ones
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=500&$orderby=createdDateTime desc`;

  const response: SharePointListResponse = await client.api(endpoint).get();
  const allTickets = response.value.map(mapToTicket);

  // Filter to only include resolved/closed tickets older than 90 days
  const archiveDate = new Date();
  archiveDate.setDate(archiveDate.getDate() - ARCHIVE_DAYS);

  return allTickets.filter((ticket) => {
    const isResolved = ticket.status === "Resolved" || ticket.status === "Closed";
    if (!isResolved) {
      return false; // Not an archived ticket
    }
    const createdDate = new Date(ticket.created);
    return createdDate < archiveDate;
  });
}

// Fetch single ticket by ID
export async function getTicket(client: Client, ticketId: string): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}?$expand=fields`;

  const item = await client.api(endpoint).get();
  return mapToTicket(item);
}

// Fetch comments for a ticket
export async function getComments(client: Client, ticketId: number): Promise<Comment[]> {
  const endpoint = `/sites/${SITE_ID}/lists/${COMMENTS_LIST_ID}/items?$expand=fields&$filter=fields/TicketID eq ${ticketId}&$orderby=createdDateTime asc`;

  const response: SharePointListResponse = await client.api(endpoint).get();
  return response.value.map(mapToComment);
}

// Add a comment to a ticket
export async function addComment(
  client: Client,
  ticketId: number,
  commentBody: string,
  isInternal: boolean = false,
  commentType: string = "Comment"
): Promise<Comment> {
  const endpoint = `/sites/${SITE_ID}/lists/${COMMENTS_LIST_ID}/items`;

  const item = await client.api(endpoint).post({
    fields: {
      Title: commentBody.substring(0, 50) + (commentBody.length > 50 ? "..." : ""),
      TicketID: ticketId,
      Body: commentBody,
      IsInternal: isInternal,
      // CommentType field is optional - only include if it exists in SharePoint
    },
  });

  return mapToComment(item);
}

// Update ticket fields
export async function updateTicket(
  client: Client,
  ticketId: string,
  updates: Partial<{
    Status: string;
    Priority: string;
    AssignedToLookupId: number;
  }>
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;

  const item = await client.api(endpoint).patch({
    fields: updates,
  });

  return mapToTicket(item);
}

// Create a new ticket
export interface CreateTicketData {
  title: string;
  description: string;
  category: "Request" | "Problem";
  priority: "Low" | "Normal" | "High" | "Urgent";
  problemType: string;
  problemTypeSub?: string;
  problemTypeSub2?: string;
  location?: string;
  assigneeEmail?: string; // Auto-assignment target
}

export async function createTicket(
  client: Client,
  ticketData: CreateTicketData,
  requesterEmail?: string
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items`;

  // Build the fields object
  const fields: Record<string, unknown> = {
    Title: ticketData.title,
    Description: ticketData.description,
    Category: ticketData.category,
    Priority: ticketData.priority,
    ProblemType: ticketData.problemType,
    Status: "New",
    SupportChannel: "Web Form",
  };

  // Only add optional fields if they have values
  if (ticketData.problemTypeSub) {
    fields.ProblemTypeSub = ticketData.problemTypeSub;
  }
  if (ticketData.problemTypeSub2) {
    fields.ProblemTypeSub2 = ticketData.problemTypeSub2;
  }
  if (ticketData.location) {
    fields.Location = ticketData.location;
  }

  // Auto-assignment: store the assignee email in OriginalAssignedTo field
  // SharePoint Person field lookup requires the user to exist in the site's user info list
  // Using OriginalAssignedTo as a text field is more reliable for auto-assignment
  if (ticketData.assigneeEmail) {
    fields.OriginalAssignedTo = ticketData.assigneeEmail;
  }

  // Note: Requester is automatically set to the authenticated user by SharePoint (Author/createdBy field)
  // The requesterEmail parameter is kept for potential future use (e.g., submitting on behalf of someone)

  const item = await client.api(endpoint).post({ fields });

  return mapToTicket(item);
}

// Get current user info
export async function getCurrentUser(client: Client) {
  return await client.api("/me").get();
}

// Get user photo (returns blob URL)
export async function getUserPhoto(client: Client, userId?: string): Promise<string | null> {
  try {
    const endpoint = userId ? `/users/${userId}/photo/$value` : "/me/photo/$value";
    const blob = await client.api(endpoint).get();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ============================================
// Approval Workflow Functions
// ============================================

// Request approval on a ticket (sets status to Pending)
export async function requestApproval(
  client: Client,
  ticketId: string,
  requesterName: string
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;

  const item = await client.api(endpoint).patch({
    fields: {
      ApprovalStatus: "Pending",
      ApprovalRequestedDate: new Date().toISOString(),
    },
  });

  return mapToTicket(item);
}

// Process approval decision (approve/deny/request changes)
export async function processApprovalDecision(
  client: Client,
  ticketId: string,
  decision: "Approved" | "Denied" | "Changes Requested",
  approverName: string,
  notes?: string
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;

  const fields: Record<string, unknown> = {
    ApprovalStatus: decision,
    ApprovalDate: new Date().toISOString(),
  };

  if (notes) {
    fields.ApprovalNotes = notes;
  }

  const item = await client.api(endpoint).patch({ fields });

  return mapToTicket(item);
}

// Get count of pending approvals (for header badge)
export async function getPendingApprovalsCount(client: Client): Promise<number> {
  // Fetch all tickets and count pending approvals client-side
  // (ApprovalStatus column may not be indexed)
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=500`;

  const response: SharePointListResponse = await client.api(endpoint).get();
  const pendingCount = response.value.filter(
    (item) => (item.fields as Record<string, unknown>).ApprovalStatus === "Pending"
  ).length;

  return pendingCount;
}

// Send email notification via Graph API
export async function sendEmail(
  client: Client,
  recipientEmail: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  const endpoint = "/me/sendMail";

  await client.api(endpoint).post({
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: htmlContent,
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail,
          },
        },
      ],
    },
    saveToSentItems: true,
  });
}

// ============================================
// User/Group Search Functions
// ============================================

export interface OrgUser {
  id: string;
  displayName: string;
  email: string;
  jobTitle?: string;
  department?: string;
  userPrincipalName: string;
}

export interface OrgGroup {
  id: string;
  displayName: string;
  description?: string;
  mail?: string;
}

// Search users in the organization
export async function searchUsers(
  client: Client,
  searchQuery: string,
  top: number = 20
): Promise<OrgUser[]> {
  if (!searchQuery || searchQuery.length < 2) {
    return [];
  }

  // Escape single quotes for OData filter
  const escapedQuery = searchQuery.replace(/'/g, "''");

  // Search by displayName, mail, or userPrincipalName
  const filter = `startswith(displayName,'${escapedQuery}') or startswith(mail,'${escapedQuery}') or startswith(userPrincipalName,'${escapedQuery}')`;

  const endpoint = `/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,jobTitle,department,userPrincipalName&$top=${top}&$orderby=displayName`;

  try {
    const response = await client.api(endpoint).get();
    return (response.value || []).map((user: Record<string, unknown>) => ({
      id: user.id as string,
      displayName: user.displayName as string,
      email: (user.mail as string) || (user.userPrincipalName as string) || "",
      jobTitle: user.jobTitle as string | undefined,
      department: user.department as string | undefined,
      userPrincipalName: user.userPrincipalName as string,
    }));
  } catch (error) {
    console.error("Failed to search users:", error);
    return [];
  }
}

// Search groups in the organization (Microsoft 365 groups and security groups)
export async function searchGroups(
  client: Client,
  searchQuery: string,
  top: number = 10
): Promise<OrgGroup[]> {
  if (!searchQuery || searchQuery.length < 2) {
    return [];
  }

  const filter = `startswith(displayName,'${searchQuery}')`;
  const endpoint = `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName,description,mail&$top=${top}&$orderby=displayName`;

  try {
    const response = await client.api(endpoint).get();
    return (response.value || []).map((group: Record<string, unknown>) => ({
      id: group.id as string,
      displayName: group.displayName as string,
      description: group.description as string | undefined,
      mail: group.mail as string | undefined,
    }));
  } catch (error) {
    console.error("Failed to search groups:", error);
    return [];
  }
}

// Search both users and groups
export async function searchUsersAndGroups(
  client: Client,
  searchQuery: string
): Promise<{ users: OrgUser[]; groups: OrgGroup[] }> {
  const [users, groups] = await Promise.all([
    searchUsers(client, searchQuery),
    searchGroups(client, searchQuery),
  ]);
  return { users, groups };
}

// Get user by email (for looking up assignees)
export async function getUserByEmail(
  client: Client,
  email: string
): Promise<OrgUser | null> {
  try {
    const endpoint = `/users/${encodeURIComponent(email)}?$select=id,displayName,mail,jobTitle,department,userPrincipalName`;
    const user = await client.api(endpoint).get();
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.mail || user.userPrincipalName || "",
      jobTitle: user.jobTitle,
      department: user.department,
      userPrincipalName: user.userPrincipalName,
    };
  } catch (error) {
    console.error("Failed to get user by email:", error);
    return null;
  }
}

// ============================================
// Bulk Operations (Admin only)
// ============================================

export interface BulkUpdateResult {
  ticketId: string;
  success: boolean;
  error?: string;
}

// Bulk update ticket status
export async function bulkUpdateStatus(
  client: Client,
  ticketIds: string[],
  newStatus: string
): Promise<BulkUpdateResult[]> {
  const results: BulkUpdateResult[] = [];

  for (const ticketId of ticketIds) {
    try {
      await updateTicketFields(client, ticketId, { Status: newStatus });
      results.push({ ticketId, success: true });
    } catch (error) {
      results.push({
        ticketId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// Bulk update ticket priority
export async function bulkUpdatePriority(
  client: Client,
  ticketIds: string[],
  newPriority: string
): Promise<BulkUpdateResult[]> {
  const results: BulkUpdateResult[] = [];

  for (const ticketId of ticketIds) {
    try {
      await updateTicketFields(client, ticketId, { Priority: newPriority });
      results.push({ ticketId, success: true });
    } catch (error) {
      results.push({
        ticketId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// Bulk reassign tickets
export async function bulkReassign(
  client: Client,
  ticketIds: string[],
  assigneeEmail: string
): Promise<BulkUpdateResult[]> {
  const results: BulkUpdateResult[] = [];

  for (const ticketId of ticketIds) {
    try {
      await updateTicketFields(client, ticketId, { OriginalAssignedTo: assigneeEmail });
      results.push({ ticketId, success: true });
    } catch (error) {
      results.push({
        ticketId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// Get SharePoint user lookup ID for a user (needed for assignee field)
export async function getSharePointUserLookupId(
  client: Client,
  userEmail: string
): Promise<number | null> {
  try {
    // First, ensure the user exists in the SharePoint site's user info list
    const endpoint = `/sites/${SITE_ID}/lists('User Information List')/items?$filter=fields/EMail eq '${userEmail}'&$select=id,fields`;
    const response = await client.api(endpoint).get();

    if (response.value && response.value.length > 0) {
      return parseInt(response.value[0].id);
    }

    // User not found in site - they may need to be added
    return null;
  } catch (error) {
    console.error("Failed to get SharePoint user lookup ID:", error);
    return null;
  }
}

// Update ticket with extended fields (for admin edits)
export async function updateTicketFields(
  client: Client,
  ticketId: string,
  updates: Partial<{
    Status: string;
    Priority: string;
    Category: string;
    ProblemType: string;
    ProblemTypeSub: string;
    ProblemTypeSub2: string;
    AssignedToLookupId: number;
    Location: string;
    OriginalAssignedTo: string;
  }>
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}`;

  // Filter out undefined values
  const filteredUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      filteredUpdates[key] = value;
    }
  }

  const item = await client.api(endpoint).patch({
    fields: filteredUpdates,
  });

  return mapToTicket(item);
}

// ============================================
// File Attachment Functions
// ============================================

// Get all attachments for a ticket using SharePoint REST API
export async function getAttachments(
  client: Client,
  ticketId: string,
  msalInstance?: IPublicClientApplication,
  account?: AccountInfo
): Promise<Attachment[]> {
  // If MSAL instance provided, use SharePoint REST API
  if (msalInstance && account) {
    try {
      // Get SharePoint-specific token (Graph tokens don't work for SP REST API)
      let tokenResponse;
      try {
        tokenResponse = await msalInstance.acquireTokenSilent({
          ...sharepointScopes,
          account,
        });
      } catch {
        // Silent acquisition failed, try interactive
        console.log("SharePoint token silent acquisition failed, trying popup...");
        tokenResponse = await msalInstance.acquireTokenPopup({
          ...sharepointScopes,
          account,
        });
      }

      const spRestUrl = `${SHAREPOINT_SITE_URL}/_api/web/lists(guid'${TICKETS_LIST_ID}')/items(${ticketId})/AttachmentFiles`;

      const response = await fetch(spRestUrl, {
        headers: {
          "Authorization": `Bearer ${tokenResponse.accessToken}`,
          "Accept": "application/json;odata=verbose",
        },
      });

      if (!response.ok) {
        // Attachments may not be enabled on this list - return empty array silently
        if (response.status === 404 || response.status === 400) {
          return [];
        }
        // 401 might mean consent not granted - silently return empty
        if (response.status === 401) {
          console.warn("SharePoint attachment access denied (401) - check AllSites.Write permission");
          return [];
        }
        throw new Error(`SharePoint REST API error: ${response.status}`);
      }

      const data = await response.json();
      return (data.d?.results || []).map((att: Record<string, unknown>) => ({
        name: att.FileName as string,
        contentType: "application/octet-stream",
        size: (att.Length as number) || 0,
        contentUrl: att.ServerRelativeUrl as string || "",
      }));
    } catch (error) {
      // Only log if it's a real error, not expected "no attachments" scenarios
      if (error instanceof Error && !error.message.includes("404") && !error.message.includes("400")) {
        console.error("Failed to get attachments:", error);
      }
      return [];
    }
  }

  // Fallback: try Graph API (may not work for SharePoint list attachments)
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}/attachments`;

  try {
    const response = await client.api(endpoint).get();
    return (response.value || []).map((att: Record<string, unknown>) => ({
      name: att.name as string,
      contentType: att.contentType as string || "application/octet-stream",
      size: att.size as number || 0,
      contentUrl: att.contentUrl as string || "",
    }));
  } catch {
    // Graph API doesn't support list item attachments - this is expected
    return [];
  }
}

// Upload an attachment to a ticket using SharePoint REST API
export async function uploadAttachment(
  client: Client,
  ticketId: string,
  file: File,
  msalInstance?: IPublicClientApplication,
  account?: AccountInfo
): Promise<Attachment | null> {
  // Sanitize filename
  const sanitizedName = file.name.replace(/[#%&*:<>?\/\\|]/g, "_");

  // If MSAL instance provided, use SharePoint REST API
  if (msalInstance && account) {
    try {
      // Get SharePoint-specific token (Graph tokens don't work for SP REST API)
      const tokenResponse = await msalInstance.acquireTokenSilent({
        ...sharepointScopes,
        account,
      });

      const arrayBuffer = await file.arrayBuffer();

      const spRestUrl = `${SHAREPOINT_SITE_URL}/_api/web/lists(guid'${TICKETS_LIST_ID}')/items(${ticketId})/AttachmentFiles/add(FileName='${encodeURIComponent(sanitizedName)}')`;

      const response = await fetch(spRestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenResponse.accessToken}`,
          "Accept": "application/json;odata=verbose",
          "Content-Type": "application/octet-stream",
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        throw new Error(`SharePoint REST API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        name: data.d?.FileName || sanitizedName,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        contentUrl: data.d?.ServerRelativeUrl || "",
      };
    } catch (error) {
      console.error("Failed to upload attachment:", error);
      return null;
    }
  }

  // Fallback: try Graph API (may not work)
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}/attachments`;

  try {
    const arrayBuffer = await file.arrayBuffer();

    const response = await client
      .api(endpoint)
      .header("Content-Type", "application/json")
      .post({
        "@odata.type": "#microsoft.graph.attachment",
        name: sanitizedName,
        contentBytes: arrayBufferToBase64(arrayBuffer),
      });

    return {
      name: response.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      contentUrl: response.contentUrl || "",
    };
  } catch (error) {
    console.error("Failed to upload attachment:", error);
    return null;
  }
}

// Alternative upload method using direct PUT (for larger files)
export async function uploadAttachmentDirect(
  client: Client,
  ticketId: string,
  file: File
): Promise<Attachment | null> {
  // Sanitize filename - remove special characters that SharePoint doesn't like
  const sanitizedName = file.name.replace(/[#%&*:<>?\/\\|]/g, "_");
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}/attachments/${encodeURIComponent(sanitizedName)}/content`;

  try {
    const arrayBuffer = await file.arrayBuffer();

    await client
      .api(endpoint)
      .header("Content-Type", file.type || "application/octet-stream")
      .put(arrayBuffer);

    // Fetch the attachment details after upload
    const attachments = await getAttachments(client, ticketId);
    return attachments.find(a => a.name === sanitizedName) || {
      name: sanitizedName,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      contentUrl: "",
    };
  } catch (error) {
    console.error("Failed to upload attachment:", error);
    return null;
  }
}

// Delete an attachment from a ticket using SharePoint REST API
export async function deleteAttachment(
  client: Client,
  ticketId: string,
  filename: string,
  msalInstance?: IPublicClientApplication,
  account?: AccountInfo
): Promise<boolean> {
  // If MSAL instance provided, use SharePoint REST API
  if (msalInstance && account) {
    try {
      // Get SharePoint-specific token (Graph tokens don't work for SP REST API)
      const tokenResponse = await msalInstance.acquireTokenSilent({
        ...sharepointScopes,
        account,
      });

      const spRestUrl = `${SHAREPOINT_SITE_URL}/_api/web/lists(guid'${TICKETS_LIST_ID}')/items(${ticketId})/AttachmentFiles/getByFileName('${encodeURIComponent(filename)}')`;

      const response = await fetch(spRestUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${tokenResponse.accessToken}`,
          "Accept": "application/json;odata=verbose",
          "X-HTTP-Method": "DELETE",
        },
      });

      return response.ok || response.status === 404; // 404 means already deleted
    } catch (error) {
      console.error("Failed to delete attachment:", error);
      return false;
    }
  }

  // Fallback: try Graph API (may not work)
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}/attachments/${encodeURIComponent(filename)}`;

  try {
    await client.api(endpoint).delete();
    return true;
  } catch (error) {
    console.error("Failed to delete attachment:", error);
    return false;
  }
}

// Download an attachment (returns blob) using SharePoint REST API
export async function downloadAttachment(
  client: Client,
  ticketId: string,
  filename: string,
  msalInstance?: IPublicClientApplication,
  account?: AccountInfo
): Promise<Blob | null> {
  // If MSAL instance provided, use SharePoint REST API
  if (msalInstance && account) {
    try {
      // Get SharePoint-specific token (Graph tokens don't work for SP REST API)
      const tokenResponse = await msalInstance.acquireTokenSilent({
        ...sharepointScopes,
        account,
      });

      const spRestUrl = `${SHAREPOINT_SITE_URL}/_api/web/lists(guid'${TICKETS_LIST_ID}')/items(${ticketId})/AttachmentFiles/getByFileName('${encodeURIComponent(filename)}')/$value`;

      const response = await fetch(spRestUrl, {
        headers: {
          "Authorization": `Bearer ${tokenResponse.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SharePoint REST API error: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error("Failed to download attachment:", error);
      return null;
    }
  }

  // Fallback: try Graph API (may not work)
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items/${ticketId}/attachments/${encodeURIComponent(filename)}/$value`;

  try {
    const response = await client.api(endpoint).get();
    return response;
  } catch (error) {
    console.error("Failed to download attachment:", error);
    return null;
  }
}

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
