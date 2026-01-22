import { Configuration, LogLevel } from "@azure/msal-browser";

// MSAL configuration for Azure AD authentication
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_TENANT_ID}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
    postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Scopes for Microsoft Graph API access
export const loginRequest = {
  scopes: ["User.Read"],
};

// Scopes needed for SharePoint list access, RBAC, email, and Teams
export const graphScopes = {
  scopes: [
    "User.Read",
    "Sites.ReadWrite.All",
    "User.Read.All", // For searching users in the organization
    "GroupMember.Read.All", // For RBAC - reading user's group memberships
    "Mail.Send", // For sending approval notification emails
    "ChannelMessage.Send", // For posting notifications to Teams channels
  ],
};

// Scopes for SharePoint REST API (needed for list item attachments)
// SharePoint REST API requires a token with SharePoint audience, not Graph
const SHAREPOINT_HOSTNAME = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL?.match(/https:\/\/([^/]+)/)?.[1] || "skyparksv.sharepoint.com";
export const sharepointScopes = {
  scopes: [
    `https://${SHAREPOINT_HOSTNAME}/AllSites.Write`,
  ],
};

// Graph API endpoints
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
  graphSitesEndpoint: "https://graph.microsoft.com/v1.0/sites",
};
