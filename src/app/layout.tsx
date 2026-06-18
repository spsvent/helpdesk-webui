"use client";

import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, AuthenticationResult, InteractionRequiredAuthError, AccountInfo } from "@azure/msal-browser";
import { msalConfig, loginRequest, graphScopes } from "@/lib/msalConfig";
import { initializeTeamsAuth, openTeamsAuthPopup } from "@/lib/teamsAuth";
import { RBACProvider } from "@/contexts/RBACContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { debugCapture } from "@/lib/debugCapture";
import { initAppInsights, setAuthenticatedUser } from "@/lib/appInsights";
import { markAuthReady, clearRenewalAttempt } from "@/lib/authActions";
import "./globals.css";

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [needsTeamsReauth, setNeedsTeamsReauth] = useState(false);

  const handleTeamsReauth = async () => {
    const result = await openTeamsAuthPopup();
    if (result) {
      window.location.reload();
    }
  };

  useEffect(() => {
    // A cached MSAL account makes the app render as signed in even when its
    // tokens can no longer be renewed silently (SPA refresh tokens last 24h,
    // and silent iframe renewal is blocked inside the Teams webview).
    // Validate up front so the user gets a working sign-in path instead of
    // every API call failing with a generic error.
    const validateCachedSession = async (account: AccountInfo, isTeams: boolean) => {
      try {
        await msalInstance.acquireTokenSilent({ ...graphScopes, account });
      } catch (error) {
        // Only react to errors that definitively require interaction -
        // transient failures will be retried by individual API calls
        if (!(error instanceof InteractionRequiredAuthError)) return;

        if (isTeams) {
          // Redirects can't run inside the Teams webview - show a banner
          // that routes through the Teams-controlled auth popup
          setNeedsTeamsReauth(true);
          return;
        }

        // In the browser, a redirect round-trip re-establishes the session
        // via the Entra SSO cookie (usually without a credential prompt).
        // Guard with sessionStorage so a failing account can't redirect-loop.
        if (!sessionStorage.getItem("helpdesk-reauth-attempted")) {
          sessionStorage.setItem("helpdesk-reauth-attempted", "1");
          await msalInstance.loginRedirect({ ...loginRequest, account });
        }
      }
    };

    // Initialize debug capture for error tracking
    debugCapture.initialize();

    // Initialize Application Insights telemetry (no-ops if connection string not set)
    initAppInsights();

    // Initialize MSAL and handle any redirect response
    const initializeMsal = async () => {
      try {
        // Must initialize MSAL before calling any other methods
        await msalInstance.initialize();

        // Check if running inside Teams (do this early)
        const teamsAuth = await initializeTeamsAuth();

        // Handle redirect promise - this processes the auth response after redirect
        const response = await msalInstance.handleRedirectPromise();

        if (response) {
          // User just logged in via redirect
          msalInstance.setActiveAccount(response.account);
          setAuthenticatedUser(response.account?.username ?? "", response.account?.name ?? undefined);
          // Any successful auth (login or renewal return) re-arms auto-renewal.
          clearRenewalAttempt();
        } else {
          // No redirect response, check for existing accounts
          const accounts = msalInstance.getAllAccounts();
          // /approve is a public, token-authorized page. Skip ALL auth bootstrapping
          // for it: no cached-session validation (which redirects and would drop the
          // ?token= from the URL) AND no Teams SSO. The page authorizes via its token.
          const isPublicActionPage =
            typeof window !== "undefined" && window.location.pathname.startsWith("/approve");
          if (isPublicActionPage) {
            if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);
            // intentionally no validateCachedSession and no ssoSilent — fall through
          } else if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            setAuthenticatedUser(accounts[0].username, accounts[0].name ?? undefined);
            // Fire-and-forget so app startup isn't blocked on a token round-trip
            validateCachedSession(accounts[0], teamsAuth.isTeams);
          } else if (teamsAuth.isTeams && teamsAuth.loginHint) {
            // Running in Teams with no existing account - try silent SSO only
            // Don't try popups in Teams as they hang in the desktop app
            console.log("Attempting Teams SSO with login hint:", teamsAuth.loginHint);

            try {
              // Add timeout to ssoSilent (5 seconds) to prevent hanging
              const ssoPromise = msalInstance.ssoSilent({
                ...loginRequest,
                loginHint: teamsAuth.loginHint,
              });
              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error("SSO timeout")), 5000)
              );
              const ssoResult = await Promise.race([ssoPromise, timeoutPromise]);
              if (ssoResult?.account) {
                msalInstance.setActiveAccount(ssoResult.account);
                setAuthenticatedUser(ssoResult.account.username, ssoResult.account.name ?? undefined);
                console.log("Teams SSO successful:", ssoResult.account.username);
              }
            } catch (ssoError) {
              // Silent SSO failed or timed out - user will need to click sign in button
              console.log("Teams SSO silent auth failed, will show login button:", ssoError);
            }
          }
        }
      } catch (error) {
        console.error("MSAL initialization error:", error);
        // A renewal redirect that returned with an error still resolved the attempt —
        // re-arm so a transient failure doesn't strand auto-renewal.
        clearRenewalAttempt();
      }

      // Let graphClient/ensureFreshToken know the initial redirect handling has settled,
      // so a token-renewal redirect won't collide with this startup interaction.
      markAuthReady();
      setIsInitialized(true);
    };

    // Add event callback for future login events
    msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const payload = event.payload as AuthenticationResult;
        msalInstance.setActiveAccount(payload.account);
        setAuthenticatedUser(payload.account?.username ?? "", payload.account?.name ?? undefined);
        clearRenewalAttempt(); // re-arm auto-renewal after a successful login
      }
    });

    initializeMsal();
  }, []);

  // Show loading while MSAL initializes
  if (!isInitialized) {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <meta name="theme-color" content="#2D5016" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Help Desk" />
          <link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet" />
          <title>SkyPark Help Desk</title>
        </head>
        <body className="bg-bg-subtle min-h-screen font-body">
          <div className="min-h-screen flex items-center justify-center">
            <LoadingSpinner message="Loading Help Desk..." size="large" />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#2D5016" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Help Desk" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <title>SkyPark Help Desk</title>
      </head>
      <body className="bg-bg-subtle min-h-screen font-body">
        <ThemeProvider>
          <MsalProvider instance={msalInstance}>
            <RBACProvider>
              {needsTeamsReauth && (
                <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-3 flex items-center justify-between gap-4">
                  <span className="text-sm">
                    Your session has expired. Sign in again to keep using the Help Desk.
                  </span>
                  <button
                    onClick={handleTeamsReauth}
                    className="px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 flex-shrink-0"
                  >
                    Sign in
                  </button>
                </div>
              )}
              {children}
            </RBACProvider>
          </MsalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
