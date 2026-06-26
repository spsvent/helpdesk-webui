const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  senderEmail: process.env.SENDER_EMAIL || "supportdesk@skyparksantasvillage.com",
  siteId: process.env.SHAREPOINT_SITE_ID,
  ticketsListId: process.env.TICKETS_LIST_ID,
  cdwListId: process.env.CDW_LIST_ID,
  commentsListId: process.env.COMMENTS_LIST_ID,
  activityLogListId: process.env.ACTIVITY_LOG_LIST_ID,
  generalManagersGroupId: process.env.GENERAL_MANAGERS_GROUP_ID,
  purchaserGroupId: process.env.PURCHASER_GROUP_ID,
  appUrl: process.env.APP_URL || "https://tickets.spsvent.net",
};

let msalClient = null;
function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }
  return msalClient;
}

async function getGraphClient() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.init({ authProvider: (done) => done(null, result.accessToken) });
}

async function sendMail(client, toEmail, subject, htmlContent) {
  await client.api(`/users/${config.senderEmail}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: htmlContent },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  });
}

async function getGroupMemberEmails(client, groupId) {
  if (!groupId) return [];
  try {
    const res = await client.api(`/groups/${groupId}/members`).select("mail,userPrincipalName").get();
    return (res.value || []).map((m) => m.mail || m.userPrincipalName).filter(Boolean);
  } catch (e) {
    console.error("getGroupMemberEmails failed:", e.message);
    return [];
  }
}

// Like getGroupMemberEmails but returns { email, displayName } for correct attribution.
async function getGroupMembers(client, groupId) {
  if (!groupId) return [];
  try {
    const res = await client.api(`/groups/${groupId}/members`).select("mail,userPrincipalName,displayName").get();
    return (res.value || [])
      .map((m) => ({ email: m.mail || m.userPrincipalName, displayName: m.displayName }))
      .filter((m) => m.email);
  } catch (e) {
    console.error("getGroupMembers failed:", e.message);
    return [];
  }
}

module.exports = { config, getGraphClient, sendMail, getGroupMemberEmails, getGroupMembers };
