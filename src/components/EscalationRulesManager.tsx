"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getGraphClient,
  getEscalationRules,
  createEscalationRule,
  updateEscalationRule,
  deleteEscalationRule,
  createEscalationList,
  EscalationRuleData,
  EscalationTriggerType,
  EscalationActionType,
} from "@/lib/graphClient";
import { getProblemTypes } from "@/lib/categoryConfig";
import UserSearchDropdown from "./UserSearchDropdown";

interface RuleFormData {
  title: string;
  triggerType: EscalationTriggerType;
  triggerHours: number;
  matchPriority: string;
  matchStatus: string;
  matchDepartment: string;
  actionType: EscalationActionType;
  escalateToPriority: string;
  notifyEmail: string;
  reassignToEmail: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormData = {
  title: "",
  triggerType: "no_response",
  triggerHours: 24,
  matchPriority: "",
  matchStatus: "",
  matchDepartment: "",
  actionType: "notify",
  escalateToPriority: "",
  notifyEmail: "",
  reassignToEmail: "",
  sortOrder: 100,
  isActive: true,
};

const TRIGGER_TYPE_OPTIONS: { value: EscalationTriggerType; label: string; description: string }[] = [
  { value: "no_response", label: "No Response", description: "No comments added since ticket creation" },
  { value: "no_update", label: "No Update", description: "Ticket status unchanged for specified hours" },
  { value: "approaching_sla", label: "Approaching SLA", description: "SLA deadline approaching (reserved)" },
];

const ACTION_TYPE_OPTIONS: { value: EscalationActionType; label: string }[] = [
  { value: "notify", label: "Notify Someone" },
  { value: "escalate_priority", label: "Escalate Priority" },
  { value: "reassign", label: "Reassign Ticket" },
  { value: "escalate_and_notify", label: "Escalate & Notify" },
];

const PRIORITY_OPTIONS = ["", "Low", "Normal", "High", "Urgent"];
const ESCALATE_TO_OPTIONS = ["", "Normal", "High", "Urgent"];
const STATUS_OPTIONS = ["", "New", "In Progress", "Pending Approval", "On Hold"];

export default function EscalationRulesManager() {
  const { instance, accounts } = useMsal();
  const [rules, setRules] = useState<EscalationRuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<EscalationRuleData | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<{ checked: number; escalated: number } | null>(null);

  // Load rules
  const loadRules = useCallback(async () => {
    if (!accounts[0]) return;

    setLoading(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const data = await getEscalationRules(client);
      setRules(data);
      setListConfigured(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error.message?.includes("not configured")) {
        setListConfigured(false);
      } else {
        setError("Failed to load rules: " + (error.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Create the SharePoint list
  const handleCreateList = async () => {
    if (!accounts[0]) return;

    setCreatingList(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const listId = await createEscalationList(client);
      setNewListId(listId);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to create list: " + (error.message || "Unknown error"));
    } finally {
      setCreatingList(false);
    }
  };

  const handleAddRule = () => {
    setEditingRule(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const handleEditRule = (rule: EscalationRuleData) => {
    setEditingRule(rule);
    setFormData({
      title: rule.title || "",
      triggerType: rule.triggerType,
      triggerHours: rule.triggerHours,
      matchPriority: rule.matchPriority || "",
      matchStatus: rule.matchStatus || "",
      matchDepartment: rule.matchDepartment || "",
      actionType: rule.actionType,
      escalateToPriority: rule.escalateToPriority || "",
      notifyEmail: rule.notifyEmail || "",
      reassignToEmail: rule.reassignToEmail || "",
      sortOrder: rule.sortOrder,
      isActive: rule.isActive,
    });
    setShowForm(true);
  };

  const handleDeleteRule = async (rule: EscalationRuleData) => {
    if (!accounts[0]) return;
    if (!confirm(`Delete rule "${rule.title || rule.triggerType}"?`)) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await deleteEscalationRule(client, rule.id);
      await loadRules();
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert("Failed to delete rule: " + (error.message || "Unknown error"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accounts[0]) return;

    // Validate based on action type
    if (
      (formData.actionType === "notify" || formData.actionType === "escalate_and_notify") &&
      !formData.notifyEmail
    ) {
      alert("Please select someone to notify");
      return;
    }
    if (
      (formData.actionType === "escalate_priority" || formData.actionType === "escalate_and_notify") &&
      !formData.escalateToPriority
    ) {
      alert("Please select a priority to escalate to");
      return;
    }
    if (formData.actionType === "reassign" && !formData.reassignToEmail) {
      alert("Please select someone to reassign to");
      return;
    }

    setSaving(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const ruleData = {
        title:
          formData.title ||
          `${formData.triggerType.replace("_", " ")} after ${formData.triggerHours}h → ${formData.actionType.replace("_", " ")}`,
        triggerType: formData.triggerType,
        triggerHours: formData.triggerHours,
        matchPriority: (formData.matchPriority as EscalationRuleData["matchPriority"]) || undefined,
        matchStatus: (formData.matchStatus as EscalationRuleData["matchStatus"]) || undefined,
        matchDepartment: formData.matchDepartment || undefined,
        actionType: formData.actionType,
        escalateToPriority:
          (formData.escalateToPriority as EscalationRuleData["escalateToPriority"]) || undefined,
        notifyEmail: formData.notifyEmail || undefined,
        reassignToEmail: formData.reassignToEmail || undefined,
        sortOrder: formData.sortOrder,
        isActive: formData.isActive,
      };

      if (editingRule) {
        await updateEscalationRule(client, editingRule.id, ruleData);
      } else {
        await createEscalationRule(client, ruleData);
      }

      setShowForm(false);
      setEditingRule(null);
      setFormData(EMPTY_FORM);
      await loadRules();
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert("Failed to save rule: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormData(EMPTY_FORM);
  };

  // Run escalation check manually
  const handleRunCheck = async () => {
    const functionUrl = process.env.NEXT_PUBLIC_ESCALATION_FUNCTION_URL;
    if (!functionUrl) {
      alert("Escalation function URL not configured. Add NEXT_PUBLIC_ESCALATION_FUNCTION_URL to .env.local");
      return;
    }

    setRunningCheck(true);
    setLastCheckResult(null);

    try {
      const response = await fetch(functionUrl, { method: "POST" });
      const data = await response.json();

      if (data.success) {
        setLastCheckResult({ checked: data.checked, escalated: data.escalated });
      } else {
        alert("Escalation check failed: " + (data.error || "Unknown error"));
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert("Failed to run escalation check: " + (error.message || "Unknown error"));
    } finally {
      setRunningCheck(false);
    }
  };

  const getTriggerLabel = (type: EscalationTriggerType): string => {
    return TRIGGER_TYPE_OPTIONS.find((t) => t.value === type)?.label || type;
  };

  const getActionLabel = (type: EscalationActionType): string => {
    return ACTION_TYPE_OPTIONS.find((t) => t.value === type)?.label || type;
  };

  // Not configured state
  if (!listConfigured) {
    return (
      <div className="bg-bg-card rounded-xl p-8">
        <div className="text-center max-w-lg mx-auto">
          {newListId ? (
            <>
              <svg
                className="w-16 h-16 text-green-500 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Created!</h2>
              <p className="text-text-secondary mb-4">
                The EscalationRules list has been created. Complete these final steps:
              </p>
              <div className="text-left bg-bg-subtle rounded-lg p-4 text-sm mb-4">
                <ol className="list-decimal list-inside space-y-3 text-text-secondary">
                  <li>
                    <span className="font-medium">Copy this list ID:</span>
                    <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                      {newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">
                      Add to your <code className="bg-gray-200 px-1 rounded">.env.local</code> file:
                    </span>
                    <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                      NEXT_PUBLIC_ESCALATION_LIST_ID={newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">Restart the dev server</span>
                    <div className="mt-1 text-xs">
                      Run <code className="bg-gray-200 px-1 rounded">npm run dev</code>
                    </div>
                  </li>
                </ol>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
              >
                Refresh Page
              </button>
            </>
          ) : (
            <>
              <svg
                className="w-16 h-16 text-yellow-500 mx-auto mb-4"
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
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Not Configured</h2>
              <p className="text-text-secondary mb-4">
                The EscalationRules SharePoint list needs to be created to manage escalation rules.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateList}
                disabled={creatingList}
                className="px-6 py-3 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 mb-6"
              >
                {creatingList ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating List...
                  </span>
                ) : (
                  "Create EscalationRules List"
                )}
              </button>

              <p className="text-xs text-text-secondary">
                This will create a new SharePoint list with all required columns. You&apos;ll need to add the
                list ID to your environment and restart.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Loading rules...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
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
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadRules}
          className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-text-primary">Escalation Rules</h2>
          <p className="text-sm text-text-secondary">
            Automatically escalate tickets based on response time or inactivity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunCheck}
            disabled={runningCheck || rules.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-border text-text-primary rounded-lg hover:bg-bg-subtle disabled:opacity-50"
          >
            {runningCheck ? (
              <>
                <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Run Check Now
              </>
            )}
          </button>
          <button
            onClick={handleAddRule}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
        </div>
      </div>

      {/* Last Check Result */}
      {lastCheckResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium">
              Escalation check complete: {lastCheckResult.checked} tickets checked,{" "}
              {lastCheckResult.escalated} escalated
            </span>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">How Escalation Works</p>
            <p>
              Escalation rules are checked periodically. When a ticket matches a rule&apos;s conditions and
              time threshold, the configured action is taken automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-medium text-text-primary">
                  {editingRule ? "Edit Rule" : "Add Escalation Rule"}
                </h3>
              </div>

              <div className="p-6 space-y-4">
                {/* Rule Name */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Rule Name (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Escalate urgent tickets after 4 hours"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>

                {/* Trigger Configuration */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary mb-3">Trigger</p>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Trigger Type
                      </label>
                      <select
                        value={formData.triggerType}
                        onChange={(e) =>
                          setFormData({ ...formData, triggerType: e.target.value as EscalationTriggerType })
                        }
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {TRIGGER_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        After (hours)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={formData.triggerHours}
                        onChange={(e) =>
                          setFormData({ ...formData, triggerHours: parseInt(e.target.value) || 24 })
                        }
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {TRIGGER_TYPE_OPTIONS.find((t) => t.value === formData.triggerType)?.description}
                  </p>
                </div>

                {/* Match Conditions */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary mb-3">Match Conditions (optional)</p>
                  <p className="text-xs text-text-secondary mb-3">
                    Leave blank to match all tickets. Specify to limit when this rule applies.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Priority</label>
                      <select
                        value={formData.matchPriority}
                        onChange={(e) => setFormData({ ...formData, matchPriority: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {PRIORITY_OPTIONS.map((pri) => (
                          <option key={pri || "any"} value={pri}>
                            {pri || "Any Priority"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
                      <select
                        value={formData.matchStatus}
                        onChange={(e) => setFormData({ ...formData, matchStatus: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status || "any"} value={status}>
                            {status || "Any Status"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Department</label>
                    <select
                      value={formData.matchDepartment}
                      onChange={(e) => setFormData({ ...formData, matchDepartment: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    >
                      <option value="">Any Department</option>
                      {getProblemTypes().map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Action Configuration */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary mb-3">Action</p>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-text-secondary mb-1">Action Type</label>
                    <select
                      value={formData.actionType}
                      onChange={(e) =>
                        setFormData({ ...formData, actionType: e.target.value as EscalationActionType })
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    >
                      {ACTION_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Escalate Priority */}
                  {(formData.actionType === "escalate_priority" ||
                    formData.actionType === "escalate_and_notify") && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Escalate To Priority
                      </label>
                      <select
                        value={formData.escalateToPriority}
                        onChange={(e) => setFormData({ ...formData, escalateToPriority: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {ESCALATE_TO_OPTIONS.map((pri) => (
                          <option key={pri || "select"} value={pri}>
                            {pri || "Select Priority..."}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Notify */}
                  {(formData.actionType === "notify" || formData.actionType === "escalate_and_notify") && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Notify (user or group)
                      </label>
                      <UserSearchDropdown
                        value={
                          formData.notifyEmail
                            ? { displayName: formData.notifyEmail.split("@")[0], email: formData.notifyEmail }
                            : null
                        }
                        onChange={(user) => setFormData({ ...formData, notifyEmail: user?.email || "" })}
                        placeholder="Search for user or group..."
                      />
                    </div>
                  )}

                  {/* Reassign */}
                  {formData.actionType === "reassign" && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Reassign To (user or group)
                      </label>
                      <UserSearchDropdown
                        value={
                          formData.reassignToEmail
                            ? {
                                displayName: formData.reassignToEmail.split("@")[0],
                                email: formData.reassignToEmail,
                              }
                            : null
                        }
                        onChange={(user) => setFormData({ ...formData, reassignToEmail: user?.email || "" })}
                        placeholder="Search for user or group..."
                      />
                    </div>
                  )}
                </div>

                {/* Sort Order & Active */}
                <div className="border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Sort Order</label>
                      <input
                        type="number"
                        value={formData.sortOrder}
                        onChange={(e) =>
                          setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 100 })
                        }
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <p className="text-xs text-text-secondary mt-1">Lower = checked first</p>
                    </div>
                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                        />
                        <span className="text-sm text-text-primary">Active</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-bg-card rounded-xl overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-16 h-16 text-text-secondary mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-text-secondary mb-4">No escalation rules configured yet.</p>
            <button
              onClick={handleAddRule}
              className="px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90"
            >
              Add Your First Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-bg-subtle text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Rule
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Conditions
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => (
                  <tr key={rule.id} className={!rule.isActive ? "opacity-50" : ""}>
                    <td className="px-4 py-3 text-sm text-text-primary">{rule.sortOrder}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-text-primary">
                        {rule.title || `${getTriggerLabel(rule.triggerType)} ${rule.triggerHours}h`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-text-primary">
                        {getTriggerLabel(rule.triggerType)}
                        <span className="text-text-secondary ml-1">({rule.triggerHours}h)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.matchPriority && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                            {rule.matchPriority}
                          </span>
                        )}
                        {rule.matchStatus && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                            {rule.matchStatus}
                          </span>
                        )}
                        {rule.matchDepartment && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                            {rule.matchDepartment}
                          </span>
                        )}
                        {!rule.matchPriority && !rule.matchStatus && !rule.matchDepartment && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">
                            All tickets
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-text-primary">{getActionLabel(rule.actionType)}</div>
                      {rule.escalateToPriority && (
                        <div className="text-xs text-text-secondary">→ {rule.escalateToPriority}</div>
                      )}
                      {rule.notifyEmail && (
                        <div className="text-xs text-text-secondary truncate max-w-[150px]">
                          → {rule.notifyEmail}
                        </div>
                      )}
                      {rule.reassignToEmail && (
                        <div className="text-xs text-text-secondary truncate max-w-[150px]">
                          → {rule.reassignToEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs rounded ${
                          rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="p-1 text-text-secondary hover:text-brand-primary"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          className="p-1 text-text-secondary hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
