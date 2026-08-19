"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msalConfig";
import { isRunningInTeams, openTeamsAuthPopup, isNaaActive } from "@/lib/teamsAuth";
import { useRBAC } from "@/contexts/RBACContext";
import { FORM_MODULES, moduleSettingsTabs } from "@/shared/formModules";

function TabLoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Built-in settings tabs. Dynamic imports so only the active tab's panel loads.
const BUILT_IN_TABS: { id: string; label: string; Component: React.ComponentType }[] = [
  {
    id: "auto-assign",
    label: "Auto-Assignment Rules",
    Component: dynamic(() => import("@/components/AutoAssignRulesManager"), { loading: () => <TabLoadingSpinner /> }),
  },
  {
    id: "escalation",
    label: "Escalation Rules",
    Component: dynamic(() => import("@/components/EscalationRulesManager"), { loading: () => <TabLoadingSpinner /> }),
  },
  {
    id: "teams",
    label: "Teams Channels",
    Component: dynamic(() => import("@/components/TeamsChannelsManager"), { loading: () => <TabLoadingSpinner /> }),
  },
  {
    id: "notification-optout",
    label: "Notification Opt-Out",
    Component: dynamic(() => import("@/components/NotificationOptOutManager"), { loading: () => <TabLoadingSpinner /> }),
  },
  {
    id: "activity-log",
    label: "Activity Log",
    Component: dynamic(() => import("@/components/ActivityLogManager"), { loading: () => <TabLoadingSpinner /> }),
  },
  {
    id: "request-visibility",
    label: "Request Visibility",
    Component: dynamic(() => import("@/components/VisibilityKeywordsManager"), { loading: () => <TabLoadingSpinner /> }),
  },
];

// Panels for tabs contributed by form-module manifests (settingsTabs). Created
// once at module scope — next/dynamic components must not be built per render.
// Which of them are *shown* is filtered per render via moduleSettingsTabs(perms).
const MODULE_TAB_PANELS = new Map<string, React.ComponentType>(
  FORM_MODULES.flatMap((m) => m.settingsTabs ?? []).map((tab) => [
    tab.id,
    dynamic(tab.load, { loading: () => <TabLoadingSpinner /> }),
  ])
);

export default function SettingsPage() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions, loading: rbacLoading } = useRBAC();
  const [activeTab, setActiveTab] = useState<string>("auto-assign");
  // Settings tabs contributed by form-module manifests, filtered by visibility.
  const visibleModuleTabs = moduleSettingsTabs(permissions);

  // Handle authentication. Under NAA the Teams host brokers loginPopup; down-level
  // Teams uses the Teams SDK popup; the browser uses a redirect.
  useEffect(() => {
    const handleAuth = async () => {
      if (!isAuthenticated && inProgress === InteractionStatus.None) {
        if (isNaaActive()) {
          try {
            await instance.loginPopup(loginRequest);
          } catch (popupError) {
            console.error("Settings: NAA loginPopup failed:", popupError);
          }
        } else if (isRunningInTeams()) {
          console.log("Settings: Running in Teams (down-level), using Teams SDK auth popup");
          const result = await openTeamsAuthPopup();
          if (result) {
            window.location.reload();
          } else {
            // Fallback to MSAL popup (works in Teams web)
            try {
              await instance.loginPopup(loginRequest);
            } catch (popupError) {
              console.error("MSAL popup also failed:", popupError);
            }
          }
        } else {
          instance.loginRedirect(loginRequest);
        }
      }
    };
    handleAuth();
  }, [isAuthenticated, inProgress, instance]);

  // Show loading state
  if (!isAuthenticated || inProgress !== InteractionStatus.None || rbacLoading) {
    return (
      <div className="min-h-screen bg-bg-subtle flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Check admin access
  const isAdmin = permissions?.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-bg-subtle flex items-center justify-center">
        <div className="text-center max-w-md p-8 bg-bg-card rounded-xl shadow-sm">
          <svg
            className="w-16 h-16 text-red-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 className="text-xl font-bold text-text-primary mb-2">Access Denied</h1>
          <p className="text-text-secondary mb-4">
            You need administrator privileges to access settings.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
          >
            Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-subtle">
      {/* Header */}
      <header className="bg-bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
              <h1 className="text-xl font-bold text-text-primary">Settings</h1>
            </div>
            <span className="text-sm text-text-secondary">
              {accounts[0]?.name || accounts[0]?.username}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs: built-ins first, then tabs contributed by form-module manifests */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {[...BUILT_IN_TABS, ...visibleModuleTabs].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {(() => {
          const ActivePanel =
            BUILT_IN_TABS.find((t) => t.id === activeTab)?.Component ??
            (visibleModuleTabs.some((t) => t.id === activeTab)
              ? MODULE_TAB_PANELS.get(activeTab)
              : undefined);
          return ActivePanel ? <ActivePanel /> : null;
        })()}
      </main>
    </div>
  );
}
