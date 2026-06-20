"use client";

import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, createNestablePublicClientApplication, IPublicClientApplication, EventType, AuthenticationResult, InteractionRequiredAuthError, AccountInfo } from "@azure/msal-browser";
import { msalConfig, loginRequest, graphScopes } from "@/lib/msalConfig";
import { initializeTeamsAuth, openTeamsAuthPopup, isNaaRecommended, isNaaActive, setNaaActive } from "@/lib/teamsAuth";
import { RBACProvider } from "@/contexts/RBACContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { debugCapture } from "@/lib/debugCapture";
import { initAppInsights, setAuthenticatedUser, trackEvent } from "@/lib/appInsights";
import { markAuthReady, clearRenewalAttempt } from "@/lib/authActions";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [needsTeamsReauth, setNeedsTeamsReauth] = useState(false);
  // MSAL is now created asynchronously (NAA's createNestablePublicClientApplication
  // returns a promise and TeamsJS must initialize first), so the instance lives in
  // state and MsalProvider only renders once it exists.
  const [msalInstance, setMsalInstance] = useState<IPublicClientApplication | null>(null);

  const handleTeamsReauth = async () => {
    if (!msalInstance) return;
    try {
      if (isNaaActive()) {
        // NAA: the host brokers an interactive token with no real popup window.
        await msalInstance.acquireTokenPopup({ ...graphScopes, account: msalInstance.getActiveAccount() ?? undefined });
        setNeedsTeamsReauth(false);
        return;
      }
    } catch (e) {
      console.error("NAA re-auth failed:", e);
    }
    // Down-level Teams: route through the Teams-controlled /auth-callback popup.
    const result = await openTeamsAuthPopup();
    if (result) {
      window.location.reload();
    }
  };

  useEffect(() => {
    // A cached MSAL account makes the app render as signed in even when its
    // tokens can no longer be renewed silently (SPA refresh tokens last 24h,
    // and silent iframe renewal is blocked inside the Teams webview). Under NAA
    // the host brokers renewal so this rarely fires, but down-level Teams and
    // the browser still need a working sign-in path instead of opaque failures.
    const validateCachedSession = async (
      instance: IPublicClientApplication,
      account: AccountInfo,
      isTeams: boolean,
    ) => {
      try {
        await instance.acquireTokenSilent({ ...graphScopes, account });
      } catch (error) {
        // Only react to errors that definitively require interaction -
        // transient failures will be retried by individual API calls
        if (!(error instanceof InteractionRequiredAuthError)) return;

        if (isTeams) {
          // Redirects can't run inside the Teams webview - show a banner that
          // re-auths via NAA (acquireTokenPopup) or the Teams-controlled popup.
          setNeedsTeamsReauth(true);
          return;
        }

        // In the browser, a redirect round-trip re-establishes the session
        // via the Entra SSO cookie (usually without a credential prompt).
        // Guard with sessionStorage so a failing account can't redirect-loop.
        if (!sessionStorage.getItem("helpdesk-reauth-attempted")) {
          sessionStorage.setItem("helpdesk-reauth-attempted", "1");
          await instance.loginRedirect({ ...loginRequest, account });
        }
      }
    };

    // Initialize debug capture for error tracking
    debugCapture.initialize();

    // Initialize Application Insights telemetry (no-ops if connection string not set)
    initAppInsights();

    // Initialize MSAL and handle any redirect response
    const initializeMsal = async () => {
      let instance: IPublicClientApplication | null = null;
      try {
        // TeamsJS MUST initialize before MSAL so the NAA host bridge is ready
        // when createNestablePublicClientApplication runs.
        const teamsAuth = await initializeTeamsAuth();

        // Create the MSAL instance. Use a nestable (NAA-brokered) client only
        // when the flag is on AND the Teams host recommends NAA; otherwise fall
        // back to the standard client (identical to pre-NAA behavior — our
        // rollback path). createNestable* can throw, so guard with a fallback.
        const naaWanted = process.env.NEXT_PUBLIC_TEAMS_NAA_ENABLED === "true";
        const useNaa = naaWanted && teamsAuth.isTeams && isNaaRecommended();
        try {
          if (useNaa) {
            instance = await createNestablePublicClientApplication(msalConfig);
            setNaaActive(true);
          } else {
            const std = new PublicClientApplication(msalConfig);
            await std.initialize();
            instance = std;
          }
        } catch (createErr) {
          console.error("NAA instance creation failed, falling back to standard:", createErr);
          setNaaActive(false);
          const std = new PublicClientApplication(msalConfig);
          await std.initialize();
          instance = std;
        }
        const naaEngaged = isNaaActive();
        // Distinguish "NAA actually engaged" from a silent fallback in telemetry —
        // the build-time flag alone can't tell you the instance became nestable.
        trackEvent("TeamsAuth", {
          step: "naa_active",
          value: String(naaEngaged),
          inTeams: String(teamsAuth.isTeams),
        });

        // Re-arm auto-renewal after any successful interactive login.
        instance.addEventCallback((event) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            instance?.setActiveAccount(payload.account);
            setAuthenticatedUser(payload.account?.username ?? "", payload.account?.name ?? undefined);
            clearRenewalAttempt();
          }
        });

        // handleRedirectPromise is unsupported under NAA (no redirects in the
        // webview); only process a redirect response on the standard client.
        const response = naaEngaged ? null : await instance.handleRedirectPromise();

        if (response) {
          // User just logged in via redirect
          instance.setActiveAccount(response.account);
          setAuthenticatedUser(response.account?.username ?? "", response.account?.name ?? undefined);
          // Any successful auth (login or renewal return) re-arms auto-renewal.
          clearRenewalAttempt();
        } else {
          // No redirect response, check for existing accounts
          const accounts = instance.getAllAccounts();
          // /approve is a public, token-authorized page. Skip ALL auth bootstrapping
          // for it: no cached-session validation (which redirects and would drop the
          // ?token= from the URL) AND no Teams SSO. The page authorizes via its token.
          const isPublicActionPage =
            typeof window !== "undefined" && window.location.pathname.startsWith("/approve");
          if (isPublicActionPage) {
            if (accounts.length > 0) instance.setActiveAccount(accounts[0]);
            // intentionally no validateCachedSession and no ssoSilent — fall through
          } else if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
            setAuthenticatedUser(accounts[0].username, accounts[0].name ?? undefined);
            // Fire-and-forget so app startup isn't blocked on a token round-trip
            validateCachedSession(instance, accounts[0], teamsAuth.isTeams);
          } else if (teamsAuth.isTeams && teamsAuth.loginHint) {
            // No cached account in Teams. ssoSilent({loginHint}) is NAA-valid and,
            // under NAA, is brokered by the host (works in the webview). Down-level
            // it depends on the Entra cookie and may fail -> user clicks Sign in.
            try {
              // Add timeout to ssoSilent (5 seconds) to prevent hanging
              const ssoPromise = instance.ssoSilent({
                ...loginRequest,
                loginHint: teamsAuth.loginHint,
              });
              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error("SSO timeout")), 5000)
              );
              const ssoResult = await Promise.race([ssoPromise, timeoutPromise]);
              if (ssoResult?.account) {
                instance.setActiveAccount(ssoResult.account);
                setAuthenticatedUser(ssoResult.account.username, ssoResult.account.name ?? undefined);
                trackEvent("TeamsAuth", { step: "silent_ok", naa: String(naaEngaged) });
              }
            } catch (ssoError) {
              // Silent SSO failed or timed out - user will need to click sign in button
              trackEvent("TeamsAuth", { step: "silent_interaction_required", naa: String(naaEngaged) });
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

      if (instance) setMsalInstance(instance);
      // Let graphClient/ensureFreshToken know the initial redirect handling has settled,
      // so a token-renewal redirect won't collide with this startup interaction.
      markAuthReady();
      setIsInitialized(true);
    };

    initializeMsal();
  }, []);

  // Show loading while MSAL initializes (instance is created asynchronously)
  if (!isInitialized || !msalInstance) {
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
