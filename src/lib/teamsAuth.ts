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
        authenticate: (params: {
          url: string;
          width?: number;
          height?: number;
          isExternal?: boolean;
        }) => Promise<string>;
        notifySuccess: (result?: string) => void;
        notifyFailure: (reason?: string) => void;
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

// Timeout for Teams operations (in ms)
const TEAMS_TIMEOUT = 3000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/**
 * Load the Teams SDK dynamically with timeout
 */
async function loadTeamsSDK(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Check if already loaded
  if (window.microsoftTeams) return true;

  const loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://res.cdn.office.net/teams-js/2.0.0/js/MicrosoftTeams.min.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  // Timeout SDK loading after 2 seconds
  return withTimeout(loadPromise, 2000, false);
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
    // Try to load SDK (with timeout)
    const sdkLoaded = await loadTeamsSDK();
    if (!sdkLoaded || !window.microsoftTeams) {
      console.log("Teams SDK not available");
      teamsInitialized = true;
      return { isTeams: false, loginHint: null };
    }

    // Initialize Teams SDK (with timeout - can hang when not in Teams)
    const initResult = await withTimeout(
      window.microsoftTeams.app.initialize().then(() => true),
      TEAMS_TIMEOUT,
      false
    );

    if (!initResult) {
      console.log("Teams SDK init timed out - not in Teams");
      teamsInitialized = true;
      return { isTeams: false, loginHint: null };
    }

    // Get context to check if we're in Teams (with timeout)
    const context = await withTimeout(
      window.microsoftTeams.app.getContext(),
      TEAMS_TIMEOUT,
      null
    );

    // Check if we have a valid Teams context
    if (context?.page?.frameContext) {
      isTeamsContext = true;
      teamsLoginHint = context.user?.loginHint || context.user?.userPrincipalName || null;
      console.log("Running inside Microsoft Teams, user:", teamsLoginHint);
    } else {
      console.log("No Teams context found");
    }

    teamsInitialized = true;
    return { isTeams: isTeamsContext, loginHint: teamsLoginHint };
  } catch (error) {
    // Not in Teams or SDK failed - this is expected when not in Teams
    console.log("Not running inside Teams:", error);
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
 * This uses the Teams SDK's built-in authentication which works better in desktop app
 */
export async function getTeamsSSOToken(): Promise<string | null> {
  if (!isTeamsContext || !window.microsoftTeams) {
    return null;
  }

  try {
    // Try silent first
    const token = await window.microsoftTeams.authentication.getAuthToken({ silent: true });
    console.log("Got Teams SSO token (silent)");
    return token;
  } catch (silentError) {
    console.log("Silent Teams token failed, trying interactive:", silentError);
    try {
      // Try interactive (will show consent prompt if needed)
      const token = await window.microsoftTeams.authentication.getAuthToken({ silent: false });
      console.log("Got Teams SSO token (interactive)");
      return token;
    } catch (interactiveError) {
      console.error("Failed to get Teams SSO token:", interactiveError);
      return null;
    }
  }
}

/**
 * Get the login hint for silent auth
 */
export function getTeamsLoginHint(): string | null {
  return teamsLoginHint;
}

/**
 * Open Teams authentication popup (works in Teams desktop app)
 * This uses the Teams SDK's built-in popup mechanism which is allowed in desktop
 */
export async function openTeamsAuthPopup(): Promise<string | null> {
  const teamsSDK = window.microsoftTeams;
  if (!teamsSDK) {
    console.error("Teams SDK not available for auth popup");
    return null;
  }

  return new Promise((resolve) => {
    // The Teams SDK has a different authentication API
    // We need to use microsoftTeams.authentication.authenticate() which opens a popup
    const authUrl = `${window.location.origin}/auth-callback`;

    console.log("Opening Teams auth popup with URL:", authUrl);

    // Teams SDK 2.0 uses a different API
    if (teamsSDK.authentication) {
      // Try the authenticate method which opens a popup that Teams controls
      const authParams = {
        url: authUrl,
        width: 600,
        height: 535,
        isExternal: false,
      };

      // The Teams SDK will handle the popup
      // We need to create the auth page that will call notifySuccess/notifyFailure
      teamsSDK.authentication.authenticate(authParams)
        .then((result: string) => {
          console.log("Teams auth popup succeeded:", result);
          resolve(result);
        })
        .catch((error: Error) => {
          console.error("Teams auth popup failed:", error);
          resolve(null);
        });
    } else {
      console.error("Teams authentication API not available");
      resolve(null);
    }
  });
}
