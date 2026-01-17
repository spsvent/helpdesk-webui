// SharePoint list item types for the Helpdesk system

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: "Request" | "Problem";
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: "New" | "In Progress" | "On Hold" | "Resolved" | "Closed";
  location?: string;
  problemType: string;
  assignedTo?: User;
  requester: User;
  dueDate?: string;
  created: string;
  modified: string;
  createdBy: User;
}

export interface Comment {
  id: string;
  ticketId: number;
  title: string;
  commentBody: string;
  isInternal: boolean;
  commentType: "Comment" | "Status Change" | "Assignment" | "Resolution" | "Note";
  created: string;
  createdBy: User;
}

export interface User {
  id?: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

// SharePoint Graph API response types
export interface SharePointListItem {
  id: string;
  fields: Record<string, unknown>;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy: {
    user: {
      id: string;
      displayName: string;
      email?: string;
    };
  };
}

export interface SharePointListResponse {
  value: SharePointListItem[];
  "@odata.nextLink"?: string;
}

// Transform SharePoint response to Ticket
export function mapToTicket(item: SharePointListItem): Ticket {
  const fields = item.fields as Record<string, unknown>;
  return {
    id: item.id,
    title: (fields.Title as string) || "",
    description: (fields.Description as string) || "",
    category: (fields.Category as Ticket["category"]) || "Request",
    priority: (fields.Priority as Ticket["priority"]) || "Normal",
    status: (fields.Status as Ticket["status"]) || "New",
    location: fields.Location as string | undefined,
    problemType: (fields.ProblemType as string) || "Other",
    assignedTo: fields.AssignedTo ? {
      displayName: (fields.AssignedTo as Record<string, unknown>)?.LookupValue as string || "",
      email: "",
    } : undefined,
    requester: {
      displayName: (fields.Requester as Record<string, unknown>)?.LookupValue as string || item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
    dueDate: fields.DueDate as string | undefined,
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
    createdBy: {
      id: item.createdBy.user.id,
      displayName: item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
  };
}

// Transform SharePoint response to Comment
export function mapToComment(item: SharePointListItem): Comment {
  const fields = item.fields as Record<string, unknown>;
  return {
    id: item.id,
    ticketId: (fields.TicketID as number) || 0,
    title: (fields.Title as string) || "",
    commentBody: (fields.CommentBody as string) || "",
    isInternal: (fields.IsInternal as boolean) || false,
    commentType: (fields.CommentType as Comment["commentType"]) || "Comment",
    created: item.createdDateTime,
    createdBy: {
      id: item.createdBy.user.id,
      displayName: item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
  };
}
