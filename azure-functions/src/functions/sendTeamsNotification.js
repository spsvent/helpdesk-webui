const { app } = require("@azure/functions");
const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
} = require("botbuilder");

// Bot configuration from environment variables
const botConfig = {
  MicrosoftAppId: process.env.BOT_APP_ID,
  MicrosoftAppPassword: process.env.BOT_APP_SECRET,
  MicrosoftAppTenantId: process.env.AZURE_TENANT_ID,
  MicrosoftAppType: "SingleTenant",
};

// Create bot adapter
let adapter = null;
function getAdapter() {
  if (!adapter) {
    const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: botConfig.MicrosoftAppId,
      MicrosoftAppPassword: botConfig.MicrosoftAppPassword,
      MicrosoftAppTenantId: botConfig.MicrosoftAppTenantId,
      MicrosoftAppType: botConfig.MicrosoftAppType,
    });
    adapter = new CloudAdapter(botFrameworkAuth);
  }
  return adapter;
}

/**
 * Send an Adaptive Card to a Teams channel as a bot
 */
app.http("SendTeamsNotification", {
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
      const { teamId, channelId, card } = body;

      if (!teamId || !channelId || !card) {
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: {
            error: "Missing required fields: teamId, channelId, card",
          },
        };
      }

      // Create conversation reference for the channel
      const conversationReference = {
        channelId: "msteams",
        serviceUrl: "https://smba.trafficmanager.net/amer/",
        conversation: {
          id: channelId,
          conversationType: "channel",
          tenantId: botConfig.MicrosoftAppTenantId,
          isGroup: true,
        },
        bot: {
          id: `28:${botConfig.MicrosoftAppId}`,
          name: "SkyPark Help Desk",
        },
      };

      // Create the activity (message) to send
      const activity = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: typeof card === "string" ? JSON.parse(card) : card,
          },
        ],
        channelData: {
          teamsChannelId: channelId,
          teamsTeamId: teamId,
        },
      };

      // Send proactive message using the bot adapter
      const botAdapter = getAdapter();

      await botAdapter.continueConversationAsync(
        botConfig.MicrosoftAppId,
        conversationReference,
        async (turnContext) => {
          await turnContext.sendActivity(activity);
        }
      );

      context.log(`Teams notification sent to channel: ${channelId}`);

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: { success: true, message: "Teams notification sent" },
      };
    } catch (error) {
      context.error("Failed to send Teams notification:", error);

      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: {
          error: "Failed to send Teams notification",
          details: error.message,
        },
      };
    }
  },
});
