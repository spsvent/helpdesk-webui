"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msalConfig";
import { useRBAC } from "@/contexts/RBACContext";
import AutoAssignRulesManager from "@/components/AutoAssignRulesManager";
import EscalationRulesManager from "@/components/EscalationRulesManager";
import TeamsChannelsManager from "@/components/TeamsChannelsManager";
import ActivityLogManager from "@/components/ActivityLogManager";

export default function SettingsPage() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions, loading: rbacLoading } = useRBAC();
  const [activeTab, setActiveTab] = useState<"auto-assign" | "escalation" | "teams" | "activity-log">("auto-assign");

  // Handle authentication
  useEffect(() => {
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      instance.loginRedirect(loginRequest);
    }
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
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("auto-assign")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "auto-assign"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Auto-Assignment Rules
          </button>
          <button
            onClick={() => setActiveTab("escalation")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "escalation"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Escalation Rules
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "teams"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Teams Channels
          </button>
          <button
            onClick={() => setActiveTab("activity-log")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "activity-log"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Activity Log
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "auto-assign" && <AutoAssignRulesManager />}
        {activeTab === "escalation" && <EscalationRulesManager />}
        {activeTab === "teams" && <TeamsChannelsManager />}
        {activeTab === "activity-log" && <ActivityLogManager />}
      </main>
    </div>
  );
}
