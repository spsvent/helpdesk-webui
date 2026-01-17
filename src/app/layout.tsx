"use client";

import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, AuthenticationResult } from "@azure/msal-browser";
import { msalConfig } from "@/lib/msalConfig";
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
    // Initialize MSAL and handle any redirect response
    const initializeMsal = async () => {
      try {
        // Must initialize MSAL before calling any other methods
        await msalInstance.initialize();

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
        <body className="bg-bg-subtle min-h-screen">
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading...</p>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-bg-subtle min-h-screen">
        <MsalProvider instance={msalInstance}>
          {children}
        </MsalProvider>
      </body>
    </html>
  );
}
