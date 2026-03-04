"use client";

import { ApplicationInsights } from "@microsoft/applicationinsights-web";

let appInsights: ApplicationInsights | null = null;

/**
 * Initialize Application Insights for client-side telemetry.
 * No-ops gracefully if the connection string is not configured (local dev).
 */
export function initAppInsights(): ApplicationInsights | null {
  if (appInsights) return appInsights;
  if (typeof window === "undefined") return null;

  const connectionString =
    process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    console.log(
      "Application Insights: No connection string configured, telemetry disabled"
    );
    return null;
  }

  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      autoTrackPageVisitTime: true,
      enableAutoRouteTracking: true,
      enableUnhandledPromiseRejectionTracking: true,
      disableFetchTracking: false,
      enableCorsCorrelation: true,
      // Don't double-count with debugCapture's fetch wrapper
      disableAjaxTracking: false,
    },
  });

  appInsights.loadAppInsights();

  // Tag all telemetry with the frontend role name so it's distinguishable
  // from the Function App in the shared Application Insights resource
  appInsights.addTelemetryInitializer((envelope) => {
    if (envelope.tags) {
      envelope.tags["ai.cloud.role"] = "helpdesk-web";
    }
  });

  return appInsights;
}

/**
 * Set the authenticated user context so all telemetry is tagged with who is logged in.
 * Call this after MSAL sets the active account.
 */
export function setAuthenticatedUser(
  email: string,
  name?: string | undefined
): void {
  if (!appInsights) return;
  // setAuthenticatedUserContext(authenticatedUserId, accountId, storeInCookie)
  appInsights.setAuthenticatedUserContext(email, undefined, true);
  if (name) {
    appInsights.context.user.authenticatedId = email;
  }
}

/**
 * Track a custom event with optional properties.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, string>
): void {
  if (!appInsights) return;
  appInsights.trackEvent({ name }, properties);
}

/**
 * Get the singleton instance for direct SDK access if needed.
 */
export function getAppInsights(): ApplicationInsights | null {
  return appInsights;
}
