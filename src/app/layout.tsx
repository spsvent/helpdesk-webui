"use client";

import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, AuthenticationResult } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "@/lib/msalConfig";
import { initializeTeamsAuth } from "@/lib/teamsAuth";
import { RBACProvider } from "@/contexts/RBACContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { debugCapture } from "@/lib/debugCapture";
import "./globals.css";

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize debug capture for error tracking
    debugCapture.initialize();

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
        } else {
          // No redirect response, check for existing accounts
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
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
      }

      setIsInitialized(true);
    };

    // Add event callback for future login events
    msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const payload = event.payload as AuthenticationResult;
        msalInstance.setActiveAccount(payload.account);
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
              {children}
            </RBACProvider>
          </MsalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
