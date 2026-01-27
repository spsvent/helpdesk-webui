const { app } = require("@azure/functions");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");

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
  authLevel: "function",
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
      const { to, subject, htmlContent, conversationId } = body;

      if (!to || !subject || !htmlContent) {
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: { error: "Missing required fields: to, subject, htmlContent" },
        };
      }

      // Get app-only token
      const accessToken = await getAppToken();
      const client = getGraphClient(accessToken);

      // Send email from the shared mailbox
      const endpoint = `/users/${config.senderEmail}/sendMail`;

      // Build internet message headers for email threading
      // This allows email clients like Outlook to group emails by ticket
      const internetMessageHeaders = conversationId
        ? [
            { name: "In-Reply-To", value: `<${conversationId}>` },
            { name: "References", value: `<${conversationId}>` },
          ]
        : undefined;

      await client.api(endpoint).post({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: htmlContent,
          },
          toRecipients: Array.isArray(to)
            ? to.map((email) => ({ emailAddress: { address: email } }))
            : [{ emailAddress: { address: to } }],
          // Add threading headers if conversationId is provided
          ...(internetMessageHeaders && { internetMessageHeaders }),
        },
        saveToSentItems: true,
      });

      context.log(`Email sent successfully to: ${Array.isArray(to) ? to.join(", ") : to}`);

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
