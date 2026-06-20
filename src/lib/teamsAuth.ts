/**
 * Teams SSO Authentication Helper
 *
 * Detects if running inside Microsoft Teams and bridges to Nested App
 * Authentication (NAA). TeamsJS is now imported from the npm package
 * (`@microsoft/teams-js`) rather than the old CDN 2.0.0 build, because NAA's
 * host bridge / `nestedAppAuth` module only exists in newer TeamsJS releases.
 *
 * NAA lets MSAL.js broker tokens *through the Teams host*, so silent token
 * acquisition works inside the webview with no Entra cookie, no popups, and no
 * redirects. The legacy `/auth-callback` popup helpers below are retained only
 * as a down-level fallback for Teams clients that don't recommend NAA.
 */

import { app, authentication, nestedAppAuth } from "@microsoft/teams-js";

// Kept for the legacy /auth-callback + teams-config pages, which still load the
// CDN TeamsJS build and reference window.microsoftTeams. NAA does not use this.
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
let naaActive = false;

// Timeout for Teams operations (in ms). app.initialize()/getContext() never
// resolve outside a Teams host, so every call is raced against a timeout.
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
 * Initialize TeamsJS and check if running inside Teams.
 * Returns the user's login hint if in a Teams context.
 *
 * IMPORTANT: TeamsJS must be initialized BEFORE MSAL is created, so the NAA
 * host bridge is established when `createNestablePublicClientApplication` runs.
 */
export async function initializeTeamsAuth(): Promise<{
  isTeams: boolean;
  loginHint: string | null;
}> {
  if (teamsInitialized) {
    return { isTeams: isTeamsContext, loginHint: teamsLoginHint };
  }

  try {
    // Initialize TeamsJS (with timeout - app.initialize() hangs when not in Teams)
    const initResult = await withTimeout(
      app.initialize().then(() => true),
      TEAMS_TIMEOUT,
      false
    );

    if (!initResult) {
      console.log("TeamsJS init timed out - not in Teams");
      teamsInitialized = true;
      return { isTeams: false, loginHint: null };
    }

    // Get context to check if we're in Teams (with timeout)
    const context = await withTimeout(app.getContext(), TEAMS_TIMEOUT, null);

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
    // Not in Teams or TeamsJS failed - expected when not in Teams
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
 * Whether the Teams host recommends the MSAL-NAA channel. Used by the layout to
 * decide whether to create a nestable (brokered) MSAL instance. Returns false
 * on any error or on down-level hosts that don't support NAA.
 */
export function isNaaRecommended(): boolean {
  try {
    return isTeamsContext && nestedAppAuth.isNAAChannelRecommended();
  } catch {
    return false;
  }
}

/**
 * Set/get whether the active MSAL instance was created as a nestable (NAA)
 * client. The layout sets this once after creating the instance; graphClient,
 * authActions and the page login handlers read it to choose the NAA token path
 * (acquireTokenPopup) over the legacy Teams-SDK popup.
 */
export function setNaaActive(active: boolean): void {
  naaActive = active;
}
export function isNaaActive(): boolean {
  return naaActive;
}

/**
 * Get the Teams SSO token (down-level path only — NAA does not use this).
 * Retained for compatibility with the legacy /auth-callback flow.
 */
export async function getTeamsSSOToken(): Promise<string | null> {
  if (!isTeamsContext) {
    return null;
  }

  try {
    // Try silent first
    const token = await authentication.getAuthToken({ silent: true });
    console.log("Got Teams SSO token (silent)");
    return token;
  } catch (silentError) {
    console.log("Silent Teams token failed, trying interactive:", silentError);
    try {
      const token = await authentication.getAuthToken({ silent: false });
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
 * Open the Teams-controlled authentication popup (down-level path only).
 * Used when NAA is unavailable; it opens /auth-callback which runs a legacy
 * MSAL redirect login and writes tokens to the shared localStorage cache.
 */
export async function openTeamsAuthPopup(): Promise<string | null> {
  return new Promise((resolve) => {
    const authUrl = `${window.location.origin}/auth-callback`;
    console.log("Opening Teams auth popup with URL:", authUrl);

    authentication
      .authenticate({ url: authUrl, width: 600, height: 535, isExternal: false })
      .then((result: string) => {
        console.log("Teams auth popup succeeded:", result);
        resolve(result);
      })
      .catch((error: unknown) => {
        console.error("Teams auth popup failed:", error);
        resolve(null);
      });
  });
}
