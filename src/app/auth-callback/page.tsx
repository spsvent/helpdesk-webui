"use client";

import { useEffect, useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "@/lib/msalConfig";

/**
 * Teams Authentication Callback Page
 * This page is opened in a popup by Teams and handles the MSAL login flow.
 * After login, it notifies Teams of success/failure to close the popup.
 */
export default function AuthCallback() {
  const [status, setStatus] = useState<"loading" | "authenticating" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const performAuth = async () => {
      try {
        // Load Teams SDK
        const script = document.createElement("script");
        script.src = "https://res.cdn.office.net/teams-js/2.0.0/js/MicrosoftTeams.min.js";
        script.async = true;

        script.onload = async () => {
          try {
            if (!window.microsoftTeams) {
              throw new Error("Teams SDK failed to load");
            }

            // Initialize Teams SDK
            await window.microsoftTeams.app.initialize();
            console.log("Teams SDK initialized in auth callback");

            setStatus("authenticating");

            // Get context for login hint
            const context = await window.microsoftTeams.app.getContext();
            const loginHint = context?.user?.loginHint || context?.user?.userPrincipalName;
            console.log("Auth callback got login hint:", loginHint);

            // Create a new MSAL instance for this popup
            const msalInstance = new PublicClientApplication(msalConfig);
            await msalInstance.initialize();

            // Handle any redirect response first
            const redirectResponse = await msalInstance.handleRedirectPromise();

            if (redirectResponse?.account) {
              // User completed login via redirect
              console.log("Auth callback: redirect login successful");
              setStatus("success");
              window.microsoftTeams.authentication.notifySuccess("login_success");
              return;
            }

            // Check if we already have an account
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
              console.log("Auth callback: already have account");
              setStatus("success");
              window.microsoftTeams.authentication.notifySuccess("already_authenticated");
              return;
            }

            // Try silent login first if we have a login hint
            if (loginHint) {
              try {
                const silentResult = await msalInstance.ssoSilent({
                  ...loginRequest,
                  loginHint,
                });
                if (silentResult?.account) {
                  console.log("Auth callback: silent SSO successful");
                  setStatus("success");
                  window.microsoftTeams.authentication.notifySuccess("sso_success");
                  return;
                }
              } catch (silentError) {
                console.log("Auth callback: silent SSO failed, trying redirect");
              }
            }

            // Need to do interactive login - use redirect in the popup
            // The popup will navigate away and come back
            console.log("Auth callback: starting redirect login");
            await msalInstance.loginRedirect({
              ...loginRequest,
              loginHint: loginHint || undefined,
            });

          } catch (error) {
            console.error("Auth callback error:", error);
            setStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Authentication failed");
            if (window.microsoftTeams?.authentication?.notifyFailure) {
              window.microsoftTeams.authentication.notifyFailure("auth_failed");
            }
          }
        };

        script.onerror = () => {
          setStatus("error");
          setErrorMessage("Failed to load Teams SDK");
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error("Auth callback setup error:", error);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Setup failed");
      }
    };

    performAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Initializing...</p>
          </>
        )}

        {status === "authenticating" && (
          <>
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Signing you in...</p>
            <p className="text-sm text-gray-500 mt-2">Please wait while we authenticate your account.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-800 font-medium">Authentication successful!</p>
            <p className="text-sm text-gray-500 mt-2">This window will close automatically.</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-gray-800 font-medium">Authentication failed</p>
            {errorMessage && (
              <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
