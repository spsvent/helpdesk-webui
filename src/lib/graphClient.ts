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

// Fetch all tickets
export async function getTickets(client: Client): Promise<Ticket[]> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items?$expand=fields&$top=100`;

  const response: SharePointListResponse = await client.api(endpoint).get();
  return response.value.map(mapToTicket);
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
