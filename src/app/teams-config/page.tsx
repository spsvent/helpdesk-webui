"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import "@/lib/teamsAuth"; // Import for Teams SDK type declarations

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tickets.spsvent.net";

export default function TeamsConfigPage() {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdkLoaded) return;

    const initializeTeams = async () => {
      try {
        const teams = window.microsoftTeams;
        if (!teams) {
          setError("Teams SDK not loaded");
          return;
        }

        await teams.app.initialize();

        // Enable the Save button
        teams.pages.config.setValidityState(true);

        // Register save handler
        teams.pages.config.registerOnSaveHandler((saveEvent) => {
          teams.pages.config.setConfig({
            entityId: "helpdesk-tab",
            contentUrl: APP_URL,
            websiteUrl: APP_URL,
            suggestedDisplayName: "Help Desk",
          }).then(() => {
            saveEvent.notifySuccess();
          }).catch((err) => {
            saveEvent.notifyFailure(err?.message || "Failed to save configuration");
          });
        });

        setInitialized(true);
      } catch (err) {
        console.error("Failed to initialize Teams SDK:", err);
        setError("Failed to initialize Teams SDK");
      }
    };

    initializeTeams();
  }, [sdkLoaded]);

  return (
    <>
      <Script
        src="https://res.cdn.office.net/teams-js/2.0.0/js/MicrosoftTeams.min.js"
        onLoad={() => setSdkLoaded(true)}
        onError={() => setError("Failed to load Teams SDK")}
      />

      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-6">
            <svg className="w-16 h-16 mx-auto text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            SkyPark Help Desk
          </h1>

          {error ? (
            <p className="text-red-600 mb-4">{error}</p>
          ) : !initialized ? (
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                Add the Help Desk to this channel to quickly access and manage support tickets.
              </p>

              <div className="bg-gray-50 rounded-lg p-4 text-left text-sm">
                <h3 className="font-semibold text-gray-900 mb-2">This tab will include:</h3>
                <ul className="text-gray-600 space-y-1">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    View and manage all tickets
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Create new support requests
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Track ticket status and updates
                  </li>
                </ul>
              </div>

              <p className="text-sm text-gray-500 mt-4">
                Click <strong>Save</strong> to add this tab to the channel.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
