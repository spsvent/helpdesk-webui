"use client";

import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, AuthenticationResult } from "@azure/msal-browser";
import { msalConfig } from "@/lib/msalConfig";
import "./globals.css";

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Handle redirect callback
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as AuthenticationResult;
    msalInstance.setActiveAccount(payload.account);
  }
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
