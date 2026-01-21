import { Client } from "@microsoft/microsoft-graph-client";
import { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { graphScopes } from "./msalConfig";
import {
  Ticket,
  Comment,
  SharePointListResponse,
  mapToTicket,
  mapToComment,
} from "@/types/ticket";

// SharePoint site and list IDs - configure in .env.local
const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TICKETS_LIST_ID = process.env.NEXT_PUBLIC_TICKETS_LIST_ID || "";
const COMMENTS_LIST_ID = process.env.NEXT_PUBLIC_COMMENTS_LIST_ID || "";

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
      Body: commentBody,  // Field is named "Body" not "CommentBody"
      IsInternal: isInternal,
      CommentType: commentType,
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

  // Search by displayName, mail, or userPrincipalName
  const filter = `startswith(displayName,'${searchQuery}') or startswith(mail,'${searchQuery}') or startswith(userPrincipalName,'${searchQuery}')`;

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
