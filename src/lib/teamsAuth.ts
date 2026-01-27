/**
 * Teams SSO Authentication Helper
 * Detects if running inside Microsoft Teams and handles silent SSO
 */

declare global {
  interface Window {
    microsoftTeams?: {
      app: {
        initialize: () => Promise<void>;
        getContext: () => Promise<{
          user?: {
            loginHint?: string;
            userPrincipalName?: string;
          };
          page?: {
            frameContext?: string;
          };
        }>;
      };
      authentication: {
        getAuthToken: (options?: { silent?: boolean }) => Promise<string>;
      };
      pages: {
        config: {
          setValidityState: (valid: boolean) => void;
          registerOnSaveHandler: (handler: (saveEvent: {
            notifySuccess: () => void;
            notifyFailure: (reason: string) => void;
          }) => void) => void;
          setConfig: (config: {
            entityId: string;
            contentUrl: string;
            websiteUrl: string;
            suggestedDisplayName: string;
          }) => Promise<void>;
        };
      };
    };
  }
}

let teamsInitialized = false;
let isTeamsContext = false;
let teamsLoginHint: string | null = null;

/**
 * Load the Teams SDK dynamically
 */
async function loadTeamsSDK(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Check if already loaded
  if (window.microsoftTeams) return true;

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://res.cdn.office.net/teams-js/2.0.0/js/MicrosoftTeams.min.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Initialize Teams SDK and check if running inside Teams
 * Returns the user's login hint if in Teams context
 */
export async function initializeTeamsAuth(): Promise<{
  isTeams: boolean;
  loginHint: string | null;
}> {
  if (teamsInitialized) {
    return { isTeams: isTeamsContext, loginHint: teamsLoginHint };
  }

  try {
    // Try to load SDK
    const sdkLoaded = await loadTeamsSDK();
    if (!sdkLoaded || !window.microsoftTeams) {
      teamsInitialized = true;
      return { isTeams: false, loginHint: null };
    }

    // Initialize Teams SDK
    await window.microsoftTeams.app.initialize();

    // Get context to check if we're in Teams
    const context = await window.microsoftTeams.app.getContext();

    // Check if we have a valid Teams context
    if (context?.page?.frameContext) {
      isTeamsContext = true;
      teamsLoginHint = context.user?.loginHint || context.user?.userPrincipalName || null;
      console.log("Running inside Microsoft Teams, user:", teamsLoginHint);
    }

    teamsInitialized = true;
    return { isTeams: isTeamsContext, loginHint: teamsLoginHint };
  } catch (error) {
    // Not in Teams or SDK failed - this is expected when not in Teams
    console.log("Not running inside Teams");
    teamsInitialized = true;
    return { isTeams: false, loginHint: null };
  }
}

/**
 * Check if currently running inside Teams
 */
export function isRunningInTeams(): boolean {
  return isTeamsContext;
}

/**
 * Get the Teams SSO token (only works inside Teams)
 */
export async function getTeamsSSOToken(): Promise<string | null> {
  if (!isTeamsContext || !window.microsoftTeams) {
    return null;
  }

  try {
    const token = await window.microsoftTeams.authentication.getAuthToken({ silent: true });
    return token;
  } catch (error) {
    console.error("Failed to get Teams SSO token:", error);
    return null;
  }
}

/**
 * Get the login hint for silent auth
 */
export function getTeamsLoginHint(): string | null {
  return teamsLoginHint;
}
