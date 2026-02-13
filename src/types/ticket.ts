// SharePoint list item types for the Helpdesk system

// Approval workflow status
export type ApprovalStatus = "None" | "Pending" | "Approved" | "Denied" | "Changes Requested";

// Purchase request workflow status
export type PurchaseStatus = "Pending Approval" | "Approved" | "Approved with Changes" | "Ordered" | "Purchased" | "Received" | "Denied";

export interface Ticket {
  id: string;
  ticketNumber?: number;  // Auto-generated ticket number
  title: string;
  description: string;
  category: "Request" | "Problem";
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: "New" | "In Progress" | "On Hold" | "Resolved" | "Closed";
  location?: string;
  problemType: string;
  problemTypeSub?: string;
  problemTypeSub2?: string;
  assignedTo?: User;
  requester: User;
  originalRequester?: string;  // For migrated tickets - original requester email
  originalAssignedTo?: string; // For migrated tickets - original assignee email
  dueDate?: string;
  created: string;
  modified: string;
  createdBy: User;
  // Approval workflow fields
  approvalStatus: ApprovalStatus;
  approvalRequestedBy?: User;
  approvalRequestedDate?: string;
  approvedBy?: User;
  approvalDate?: string;
  approvalNotes?: string;
  // Purchase request fields
  isPurchaseRequest?: boolean;
  purchaseItemUrl?: string;
  purchaseQuantity?: number;
  purchaseEstCostPerItem?: number;
  purchaseJustification?: string;
  purchaseProject?: string;
  purchaseStatus?: PurchaseStatus;
  purchaseVendor?: string;
  purchaseConfirmationNum?: string;
  purchaseActualCost?: number;
  purchaseNotes?: string;
  purchaseExpectedDelivery?: string;
  purchasedDate?: string;
  purchasedByEmail?: string;
  receivedDate?: string;
  receivedNotes?: string;
  receivedByEmail?: string;
}

export interface Comment {
  id: string;
  ticketId: number;
  title: string;
  commentBody: string;
  isInternal: boolean;
  commentType: "Comment" | "Status Change" | "Assignment" | "Resolution" | "Note" | "Approval";
  created: string;
  createdBy: User;
  originalAuthor?: string;  // For migrated comments - original author name/email
  originalCreated?: string; // For migrated comments - original timestamp
}

export interface User {
  id?: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

// File attachment on a ticket
export interface Attachment {
  name: string;
  contentType: string;
  size: number;
  contentUrl: string;  // URL to download the file
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

// Extract display name from a SharePoint Person/Lookup field.
// Graph API may return these as an object with LookupValue, or as a plain string.
function getPersonDisplayName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const obj = field as Record<string, unknown>;
    return (obj.LookupValue as string) || (obj.Title as string) || (obj.Email as string) || "";
  }
  return "";
}

function getPersonEmail(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const obj = field as Record<string, unknown>;
  return (obj.Email as string) || "";
}

// Transform SharePoint response to Ticket
export function mapToTicket(item: SharePointListItem): Ticket {
  const fields = item.fields as Record<string, unknown>;
  return {
    id: item.id,
    ticketNumber: fields.TicketNumber as number | undefined,
    title: (fields.Title as string) || "",
    description: (fields.Description as string) || "",
    category: (fields.Category as Ticket["category"]) || "Request",
    priority: (fields.Priority as Ticket["priority"]) || "Normal",
    status: (fields.Status as Ticket["status"]) || "New",
    location: fields.Location as string | undefined,
    problemType: (fields.ProblemType as string) || "Other",
    problemTypeSub: fields.ProblemTypeSub as string | undefined,
    problemTypeSub2: fields.ProblemTypeSub2 as string | undefined,
    assignedTo: fields.AssignedTo ? {
      displayName: getPersonDisplayName(fields.AssignedTo),
      email: getPersonEmail(fields.AssignedTo),
    } : undefined,
    requester: {
      displayName: getPersonDisplayName(fields.Requester) || item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
    originalRequester: fields.OriginalRequester as string | undefined,
    originalAssignedTo: fields.OriginalAssignedTo as string | undefined,
    dueDate: fields.DueDate as string | undefined,
    created: item.createdDateTime,
    modified: item.lastModifiedDateTime,
    createdBy: {
      id: item.createdBy.user.id,
      displayName: item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
    // Approval workflow fields
    approvalStatus: (fields.ApprovalStatus as ApprovalStatus) || "None",
    approvalRequestedBy: fields.ApprovalRequestedBy ? {
      displayName: getPersonDisplayName(fields.ApprovalRequestedBy),
      email: getPersonEmail(fields.ApprovalRequestedBy),
    } : undefined,
    approvalRequestedDate: fields.ApprovalRequestedDate as string | undefined,
    approvedBy: fields.ApprovedBy ? {
      displayName: getPersonDisplayName(fields.ApprovedBy),
      email: getPersonEmail(fields.ApprovedBy),
    } : undefined,
    approvalDate: fields.ApprovalDate as string | undefined,
    approvalNotes: fields.ApprovalNotes as string | undefined,
    // Purchase request fields
    isPurchaseRequest: fields.IsPurchaseRequest as boolean | undefined,
    purchaseItemUrl: fields.PurchaseItemUrl as string | undefined,
    purchaseQuantity: fields.PurchaseQuantity as number | undefined,
    purchaseEstCostPerItem: fields.PurchaseEstCostPerItem as number | undefined,
    purchaseJustification: fields.PurchaseJustification as string | undefined,
    purchaseProject: fields.PurchaseProject as string | undefined,
    purchaseStatus: fields.PurchaseStatus as PurchaseStatus | undefined,
    purchaseVendor: fields.PurchaseVendor as string | undefined,
    purchaseConfirmationNum: fields.PurchaseConfirmationNum as string | undefined,
    purchaseActualCost: fields.PurchaseActualCost as number | undefined,
    purchaseNotes: fields.PurchaseNotes as string | undefined,
    purchaseExpectedDelivery: fields.PurchaseExpectedDelivery as string | undefined,
    purchasedDate: fields.PurchasedDate as string | undefined,
    purchasedByEmail: fields.PurchasedByEmail as string | undefined,
    receivedDate: fields.ReceivedDate as string | undefined,
    receivedNotes: fields.ReceivedNotes as string | undefined,
    receivedByEmail: fields.ReceivedByEmail as string | undefined,
  };
}

// Transform SharePoint response to Comment
export function mapToComment(item: SharePointListItem): Comment {
  const fields = item.fields as Record<string, unknown>;

  // Handle both old schema (Body) and new schema (CommentBody)
  const commentBody = (fields.CommentBody as string) || (fields.Body as string) || "";

  // Handle old CommentType values (Reply, Private note)
  const rawCommentType = fields.CommentType as string;
  const isPrivateNote = rawCommentType === "Private note";
  const commentType = rawCommentType === "Reply" ? "Comment" :
                      rawCommentType === "Private note" ? "Note" :
                      (rawCommentType as Comment["commentType"]) || "Comment";

  return {
    id: item.id,
    ticketId: (fields.TicketID as number) || 0,
    title: (fields.Title as string) || "",
    commentBody: commentBody,
    isInternal: (fields.IsInternal as boolean) || isPrivateNote,
    commentType: commentType,
    created: item.createdDateTime,
    createdBy: {
      id: item.createdBy.user.id,
      displayName: item.createdBy.user.displayName,
      email: item.createdBy.user.email || "",
    },
    originalAuthor: fields.OriginalAuthor as string | undefined,
    originalCreated: fields.OriginalCreated as string | undefined,
  };
}
