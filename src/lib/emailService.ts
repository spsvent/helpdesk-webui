import { Client } from "@microsoft/microsoft-graph-client";
import { Ticket } from "@/types/ticket";
import { sendEmail } from "./graphClient";

// App URL for email action buttons
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lively-coast-062dfc51e.1.azurestaticapps.net";

// General Managers group ID from environment
const GENERAL_MANAGERS_GROUP_ID = process.env.NEXT_PUBLIC_GENERAL_MANAGERS_GROUP_ID || "";

// Email template styles
const emailStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
  .ticket-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
  .ticket-info h3 { margin: 0 0 8px 0; color: #1e3a5f; }
  .ticket-info p { margin: 4px 0; color: #6b7280; }
  .label { font-weight: 600; color: #374151; }
  .actions { text-align: center; margin: 24px 0; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 8px 8px 8px; }
  .btn-approve { background: #10b981; color: white; }
  .btn-deny { background: #ef4444; color: white; }
  .btn-changes { background: #f59e0b; color: white; }
  .btn-view { background: #1e3a5f; color: white; }
  .footer { text-align: center; padding: 16px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-approved { background: #d1fae5; color: #065f46; }
  .badge-denied { background: #fee2e2; color: #991b1b; }
  .badge-changes { background: #ffedd5; color: #9a3412; }
`;

// Get members of the General Managers group
export async function getApproverEmails(client: Client): Promise<string[]> {
  if (!GENERAL_MANAGERS_GROUP_ID) {
    console.warn("GENERAL_MANAGERS_GROUP_ID not configured");
    return [];
  }

  try {
    const response = await client
      .api(`/groups/${GENERAL_MANAGERS_GROUP_ID}/members`)
      .select("mail,userPrincipalName")
      .get();

    const emails: string[] = [];
    for (const member of response.value) {
      const email = member.mail || member.userPrincipalName;
      if (email) {
        emails.push(email);
      }
    }
    return emails;
  } catch (error) {
    console.error("Failed to get approver emails:", error);
    return [];
  }
}

// Generate approval request email HTML
function generateApprovalRequestEmail(
  ticket: Ticket,
  requesterName: string
): string {
  const approveUrl = `${APP_URL}?ticket=${ticket.id}&action=approve`;
  const denyUrl = `${APP_URL}?ticket=${ticket.id}&action=deny`;
  const changesUrl = `${APP_URL}?ticket=${ticket.id}&action=changes`;
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Approval Request</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p><strong>${requesterName}</strong> has requested your approval on a support ticket.</p>

      <div class="ticket-info">
        <h3>Ticket #${ticket.id}: ${escapeHtml(ticket.title)}</h3>
        <p><span class="label">Category:</span> ${ticket.category}</p>
        <p><span class="label">Priority:</span> ${ticket.priority}</p>
        <p><span class="label">Status:</span> ${ticket.status}</p>
        <p><span class="label">Problem Type:</span> ${ticket.problemType}${ticket.problemTypeSub ? ` > ${ticket.problemTypeSub}` : ""}${ticket.problemTypeSub2 ? ` > ${ticket.problemTypeSub2}` : ""}</p>
        <p><span class="label">Requester:</span> ${ticket.requester.displayName}</p>
        ${ticket.description ? `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><span class="label">Description:</span><br>${escapeHtml(ticket.description.substring(0, 300))}${ticket.description.length > 300 ? "..." : ""}</p>` : ""}
      </div>

      <div class="actions">
        <a href="${approveUrl}" class="btn btn-approve">Approve</a>
        <a href="${denyUrl}" class="btn btn-deny">Deny</a>
        <a href="${changesUrl}" class="btn btn-changes">Request Changes</a>
      </div>

      <p style="text-align: center; color: #6b7280; font-size: 14px;">
        Or <a href="${viewUrl}" style="color: #1e3a5f;">view the full ticket</a> in the Help Desk
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
      <p>Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// Generate approval decision notification email HTML
function generateDecisionEmail(
  ticket: Ticket,
  decision: "Approved" | "Denied" | "Changes Requested",
  approverName: string,
  notes?: string
): string {
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;

  const badgeClass = decision === "Approved" ? "badge-approved" :
                     decision === "Denied" ? "badge-denied" : "badge-changes";

  const decisionText = decision === "Approved" ? "has been approved" :
                       decision === "Denied" ? "has been denied" :
                       "requires changes";

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Approval Decision</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p style="text-align: center; margin-bottom: 16px;">
        <span class="badge ${badgeClass}">${decision}</span>
      </p>

      <p>Your approval request for ticket <strong>#${ticket.id}</strong> ${decisionText}.</p>

      <div class="ticket-info">
        <h3>${escapeHtml(ticket.title)}</h3>
        <p><span class="label">Decision by:</span> ${approverName}</p>
        <p><span class="label">Decision:</span> ${decision}</p>
        ${notes ? `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><span class="label">Notes:</span><br>${escapeHtml(notes)}</p>` : ""}
      </div>

      <div class="actions">
        <a href="${viewUrl}" class="btn btn-view">View Ticket</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
      <p>Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// Send approval request to all managers
export async function sendApprovalRequestEmail(
  client: Client,
  ticket: Ticket,
  requesterName: string
): Promise<void> {
  const approverEmails = await getApproverEmails(client);

  if (approverEmails.length === 0) {
    console.warn("No approver emails found - cannot send approval request");
    return;
  }

  const subject = `[Approval Required] Ticket #${ticket.id}: ${ticket.title}`;
  const htmlContent = generateApprovalRequestEmail(ticket, requesterName);
  const conversationId = getTicketConversationId(ticket.id);

  // Send to each approver
  const sendPromises = approverEmails.map((email) =>
    sendEmail(client, email, subject, htmlContent, conversationId).catch((error) => {
      console.error(`Failed to send approval request to ${email}:`, error);
    })
  );

  await Promise.all(sendPromises);
}

// Send decision notification to the requester
export async function sendDecisionEmail(
  client: Client,
  ticket: Ticket,
  decision: "Approved" | "Denied" | "Changes Requested",
  approverName: string,
  requesterEmail: string,
  notes?: string
): Promise<void> {
  const decisionWord = decision === "Changes Requested" ? "Changes Requested" : decision;
  const subject = `[${decisionWord}] Ticket #${ticket.id}: ${ticket.title}`;
  const htmlContent = generateDecisionEmail(ticket, decision, approverName, notes);
  const conversationId = getTicketConversationId(ticket.id);

  await sendEmail(client, requesterEmail, subject, htmlContent, conversationId);
}

// Escape HTML to prevent XSS in emails
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ============================================
// General Ticket Notification Emails
// ============================================

// Generate new ticket notification email HTML
function generateNewTicketEmail(
  ticket: Ticket,
  recipientName: string
): string {
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">New Ticket Assigned</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p>A new support ticket has been assigned to you.</p>

      <div class="ticket-info">
        <h3>Ticket #${ticket.id}: ${escapeHtml(ticket.title)}</h3>
        <p><span class="label">Priority:</span> ${ticket.priority}</p>
        <p><span class="label">Category:</span> ${ticket.category}</p>
        <p><span class="label">Department:</span> ${ticket.problemType}${ticket.problemTypeSub ? ` > ${ticket.problemTypeSub}` : ""}</p>
        <p><span class="label">Requester:</span> ${escapeHtml(ticket.requester.displayName)}</p>
        ${ticket.location ? `<p><span class="label">Location:</span> ${escapeHtml(ticket.location)}</p>` : ""}
        ${ticket.description ? `<p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><span class="label">Description:</span><br>${escapeHtml(ticket.description.substring(0, 500))}${ticket.description.length > 500 ? "..." : ""}</p>` : ""}
      </div>

      <div class="actions">
        <a href="${viewUrl}" class="btn btn-view">View Ticket</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
    </div>
  </div>
</body>
</html>`;
}

// Generate ticket assignment notification email HTML
function generateAssignmentEmail(
  ticket: Ticket,
  recipientName: string,
  assignedByName: string
): string {
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Ticket Assigned to You</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p><strong>${escapeHtml(assignedByName)}</strong> has assigned you to a support ticket.</p>

      <div class="ticket-info">
        <h3>Ticket #${ticket.id}: ${escapeHtml(ticket.title)}</h3>
        <p><span class="label">Priority:</span> ${ticket.priority}</p>
        <p><span class="label">Status:</span> ${ticket.status}</p>
        <p><span class="label">Requester:</span> ${escapeHtml(ticket.requester.displayName)}</p>
      </div>

      <div class="actions">
        <a href="${viewUrl}" class="btn btn-view">View Ticket</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
    </div>
  </div>
</body>
</html>`;
}

// Generate new comment notification email HTML
function generateCommentEmail(
  ticket: Ticket,
  commenterName: string,
  commentPreview: string,
  recipientIsRequester: boolean
): string {
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;
  const headline = recipientIsRequester
    ? "New Update on Your Ticket"
    : "New Comment on Ticket";

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">${headline}</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p><strong>${escapeHtml(commenterName)}</strong> added a comment to ticket #${ticket.id}.</p>

      <div class="ticket-info">
        <h3>${escapeHtml(ticket.title)}</h3>
        <p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <span class="label">Comment:</span><br>
          ${escapeHtml(commentPreview)}${commentPreview.length >= 300 ? "..." : ""}
        </p>
      </div>

      <div class="actions">
        <a href="${viewUrl}" class="btn btn-view">View Full Conversation</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
    </div>
  </div>
</body>
</html>`;
}

// Generate status change notification email HTML
function generateStatusChangeEmail(
  ticket: Ticket,
  oldStatus: string,
  changedByName: string
): string {
  const viewUrl = `${APP_URL}?ticket=${ticket.id}`;

  const statusColors: Record<string, string> = {
    "New": "#3b82f6",
    "In Progress": "#10b981",
    "On Hold": "#f59e0b",
    "Resolved": "#059669",
    "Closed": "#64748b",
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Ticket Status Updated</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">SkyPark Help Desk</p>
    </div>
    <div class="content">
      <p>The status of your support ticket has been updated by <strong>${escapeHtml(changedByName)}</strong>.</p>

      <div class="ticket-info">
        <h3>Ticket #${ticket.id}: ${escapeHtml(ticket.title)}</h3>
        <p style="margin: 16px 0; text-align: center;">
          <span style="padding: 4px 12px; border-radius: 4px; background: #f3f4f6; color: #6b7280;">${escapeHtml(oldStatus)}</span>
          <span style="margin: 0 8px;">→</span>
          <span style="padding: 4px 12px; border-radius: 4px; background: ${statusColors[ticket.status] || "#3b82f6"}; color: white;">${ticket.status}</span>
        </p>
      </div>

      <div class="actions">
        <a href="${viewUrl}" class="btn btn-view">View Ticket</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from SkyPark Help Desk.</p>
    </div>
  </div>
</body>
</html>`;
}

// Generate a deterministic conversation ID for a ticket
// This allows email clients to thread all emails about the same ticket
function getTicketConversationId(ticketId: string): string {
  return `ticket-${ticketId}@helpdesk.skypark.local`;
}

// Send notification when a new ticket is created with an assignee
export async function sendNewTicketEmail(
  client: Client,
  ticket: Ticket,
  assigneeEmail: string,
  assigneeName: string
): Promise<void> {
  const subject = `[New Ticket] Ticket #${ticket.id}: ${ticket.title}`;
  const htmlContent = generateNewTicketEmail(ticket, assigneeName);
  const conversationId = getTicketConversationId(ticket.id);
  await sendEmail(client, assigneeEmail, subject, htmlContent, conversationId);
}

// Send notification when a ticket is assigned to someone
export async function sendAssignmentEmail(
  client: Client,
  ticket: Ticket,
  assigneeEmail: string,
  assigneeName: string,
  assignedByName: string
): Promise<void> {
  const subject = `[Assigned] Ticket #${ticket.id}: ${ticket.title}`;
  const htmlContent = generateAssignmentEmail(ticket, assigneeName, assignedByName);
  const conversationId = getTicketConversationId(ticket.id);
  await sendEmail(client, assigneeEmail, subject, htmlContent, conversationId);
}

// Send notification when a comment is added (to requester and/or assignee)
export async function sendCommentEmail(
  client: Client,
  ticket: Ticket,
  recipientEmail: string,
  commenterName: string,
  commentText: string,
  recipientIsRequester: boolean
): Promise<void> {
  const subject = recipientIsRequester
    ? `[Update] Ticket #${ticket.id}: ${ticket.title}`
    : `[New Comment] Ticket #${ticket.id}: ${ticket.title}`;
  const preview = commentText.substring(0, 300);
  const htmlContent = generateCommentEmail(ticket, commenterName, preview, recipientIsRequester);
  const conversationId = getTicketConversationId(ticket.id);
  await sendEmail(client, recipientEmail, subject, htmlContent, conversationId);
}

// Send notification when ticket status changes (to requester)
export async function sendStatusChangeEmail(
  client: Client,
  ticket: Ticket,
  requesterEmail: string,
  oldStatus: string,
  changedByName: string
): Promise<void> {
  const subject = `[${ticket.status}] Ticket #${ticket.id}: ${ticket.title}`;
  const htmlContent = generateStatusChangeEmail(ticket, oldStatus, changedByName);
  const conversationId = getTicketConversationId(ticket.id);
  await sendEmail(client, requesterEmail, subject, htmlContent, conversationId);
}
