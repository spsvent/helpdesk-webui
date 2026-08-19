const { app } = require("@azure/functions");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
const { filterRecipients } = require("../lib/optOut");
const { excludeActor } = require("../lib/selfNotify");

// Configuration from environment variables
const config = {
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.AZURE_TENANT_ID,
  senderEmail: process.env.SENDER_EMAIL || "supportdesk@skyparksantasvillage.com",
};

// Create MSAL confidential client for app-only auth
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

// Get app-only access token
async function getAppToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return result.accessToken;
}

// Create Graph client with app-only token
function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

app.http("SendEmail", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    try {
      const body = await request.json();
      const { to, subject, htmlContent, actorEmail } = body;

      const recipientList = Array.isArray(to) ? to.join(", ") : to;
      const recipientCount = Array.isArray(to) ? to.length : (to ? 1 : 0);
      context.log(
        `[SendEmail] Received request: recipients=${recipientCount}, to=${recipientList || "(none)"}, subject=${(subject || "").substring(0, 80)}`
      );

      if (!to || !subject || !htmlContent) {
        context.log("[SendEmail] Rejected: missing required fields");
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: { error: "Missing required fields: to, subject, htmlContent" },
        };
      }

      // Get app-only token
      const accessToken = await getAppToken();
      const client = getGraphClient(accessToken);

      // Self-notification: drop the actor from their own change's notification.
      // Backstop for the SPA, which also filters at each call site.
      const addressed = excludeActor(Array.isArray(to) ? to : [to], actorEmail);
      if (addressed.length === 0) {
        context.log(`[SendEmail] Only recipient was the actor — nothing sent (was: ${recipientList})`);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true, suppressed: true, message: "Recipient is the actor" },
        };
      }

      // Recipient opt-out: drop any address on the NotificationOptOut list. Those
      // people keep their access/roles; only support-desk email delivery stops.
      const recipients = await filterRecipients(client, addressed);
      if (recipients.length === 0) {
        context.log(`[SendEmail] All recipient(s) opted out — nothing sent (was: ${recipientList})`);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true, suppressed: true, message: "All recipients opted out of notifications" },
        };
      }

      // Send email from the shared mailbox
      const endpoint = `/users/${config.senderEmail}/sendMail`;

      // Note: Standard email threading headers (In-Reply-To, References) are not
      // supported by Microsoft Graph - it requires custom headers to start with 'x-'.
      // Email threading will rely on subject matching instead.

      await client.api(endpoint).post({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: htmlContent,
          },
          toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      });

      context.log(`Email sent successfully to: ${recipients.join(", ")}`);

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: { success: true, message: "Email sent successfully" },
      };
    } catch (error) {
      context.error("Failed to send email:", error);

      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: {
          error: "Failed to send email",
          details: error.message,
        },
      };
    }
  },
});
