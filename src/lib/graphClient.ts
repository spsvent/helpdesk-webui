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
        // Fallback to interactive if silent fails
        try {
          const response = await msalInstance.acquireTokenPopup(graphScopes);
          done(null, response.accessToken);
        } catch (popupError) {
          done(popupError as Error, null);
        }
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
      CommentBody: commentBody,
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
  location?: string;
}

export async function createTicket(
  client: Client,
  ticketData: CreateTicketData
): Promise<Ticket> {
  const endpoint = `/sites/${SITE_ID}/lists/${TICKETS_LIST_ID}/items`;

  const item = await client.api(endpoint).post({
    fields: {
      Title: ticketData.title,
      Description: ticketData.description,
      Category: ticketData.category,
      Priority: ticketData.priority,
      ProblemType: ticketData.problemType,
      Location: ticketData.location || "",
      Status: "New",
    },
  });

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
