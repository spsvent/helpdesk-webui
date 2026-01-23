"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getGraphClient,
  getAutoAssignRules,
  createAutoAssignRule,
  updateAutoAssignRule,
  deleteAutoAssignRule,
  createAutoAssignList,
  AutoAssignRuleData,
} from "@/lib/graphClient";
import { getProblemTypes, getProblemTypeSubs, getProblemTypeSub2s } from "@/lib/categoryConfig";
import UserSearchDropdown from "./UserSearchDropdown";

interface RuleFormData {
  title: string;
  department: string;
  subCategory: string;
  specificType: string;
  category: string;
  priority: string;
  assignToEmail: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormData = {
  title: "",
  department: "",
  subCategory: "",
  specificType: "",
  category: "",
  priority: "",
  assignToEmail: "",
  sortOrder: 100,
  isActive: true,
};

const PRIORITY_OPTIONS = ["", "Low", "Normal", "High", "Urgent"];
const CATEGORY_OPTIONS = ["", "Request", "Problem"];

export default function AutoAssignRulesManager() {
  const { instance, accounts } = useMsal();
  const [rules, setRules] = useState<AutoAssignRuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoAssignRuleData | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Cascading dropdown options
  const [subCategories, setSubCategories] = useState<string[]>([]);
  const [specificTypes, setSpecificTypes] = useState<string[]>([]);

  // Load rules
  const loadRules = useCallback(async () => {
    if (!accounts[0]) return;

    setLoading(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const data = await getAutoAssignRules(client);
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

  // Update cascading dropdowns
  useEffect(() => {
    if (formData.department) {
      setSubCategories(getProblemTypeSubs(formData.department));
    } else {
      setSubCategories([]);
      setFormData((prev) => ({ ...prev, subCategory: "", specificType: "" }));
    }
  }, [formData.department]);

  useEffect(() => {
    if (formData.department && formData.subCategory) {
      setSpecificTypes(getProblemTypeSub2s(formData.department, formData.subCategory));
    } else {
      setSpecificTypes([]);
      setFormData((prev) => ({ ...prev, specificType: "" }));
    }
  }, [formData.department, formData.subCategory]);

  // Create the SharePoint list
  const handleCreateList = async () => {
    if (!accounts[0]) return;

    setCreatingList(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const listId = await createAutoAssignList(client);
      setNewListId(listId);
      // Note: User will need to add this to .env.local and restart
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

  const handleEditRule = (rule: AutoAssignRuleData) => {
    setEditingRule(rule);
    setFormData({
      title: rule.title || "",
      department: rule.department || "",
      subCategory: rule.subCategory || "",
      specificType: rule.specificType || "",
      category: rule.category || "",
      priority: rule.priority || "",
      assignToEmail: rule.assignToEmail,
      sortOrder: rule.sortOrder,
      isActive: rule.isActive,
    });
    setShowForm(true);
  };

  const handleDeleteRule = async (rule: AutoAssignRuleData) => {
    if (!accounts[0]) return;
    if (!confirm(`Delete rule "${rule.title || rule.department}"?`)) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await deleteAutoAssignRule(client, rule.id);
      await loadRules();
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert("Failed to delete rule: " + (error.message || "Unknown error"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accounts[0]) return;

    if (!formData.assignToEmail) {
      alert("Please select an assignee");
      return;
    }

    setSaving(true);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const ruleData = {
        title: formData.title || `${formData.department || "All"} → ${formData.assignToEmail}`,
        department: formData.department || undefined,
        subCategory: formData.subCategory || undefined,
        specificType: formData.specificType || undefined,
        category: (formData.category as "Request" | "Problem") || undefined,
        priority: (formData.priority as "Low" | "Normal" | "High" | "Urgent") || undefined,
        assignToEmail: formData.assignToEmail,
        sortOrder: formData.sortOrder,
        isActive: formData.isActive,
      };

      if (editingRule) {
        await updateAutoAssignRule(client, editingRule.id, ruleData);
      } else {
        await createAutoAssignRule(client, ruleData);
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

  // Not configured state
  if (!listConfigured) {
    return (
      <div className="bg-bg-card rounded-xl p-8">
        <div className="text-center max-w-lg mx-auto">
          {newListId ? (
            // List was just created - show success and env instructions
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
                The AutoAssignRules list has been created. Complete these final steps:
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
                    <span className="font-medium">Add to your <code className="bg-gray-200 px-1 rounded">.env.local</code> file:</span>
                    <div className="mt-1 p-2 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs break-all select-all">
                      NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID={newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">Restart the dev server</span>
                    <div className="mt-1 text-xs">Run <code className="bg-gray-200 px-1 rounded">npm run dev</code></div>
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
            // List not created yet - show create button
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
                The AutoAssignRules SharePoint list needs to be created to manage assignment rules.
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
                  "Create AutoAssignRules List"
                )}
              </button>

              <p className="text-xs text-text-secondary">
                This will create a new SharePoint list with all required columns.
                You&apos;ll need to add the list ID to your environment and restart.
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
          <h2 className="text-lg font-medium text-text-primary">Auto-Assignment Rules</h2>
          <p className="text-sm text-text-secondary">
            Rules are evaluated in order (lowest sort order first). First matching rule wins.
          </p>
        </div>
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-medium text-text-primary">
                  {editingRule ? "Edit Rule" : "Add Rule"}
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
                    placeholder="e.g., Tech tickets to IT team"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>

                {/* Match Conditions */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary mb-3">Match Conditions</p>
                  <p className="text-xs text-text-secondary mb-3">
                    Leave blank to match any value. More specific rules should have lower sort order.
                  </p>

                  {/* Department */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Department
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
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

                  {/* Sub-Category */}
                  {subCategories.length > 0 && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Sub-Category
                      </label>
                      <select
                        value={formData.subCategory}
                        onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        <option value="">Any Sub-Category</option>
                        {subCategories.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Specific Type */}
                  {specificTypes.length > 0 && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Specific Type
                      </label>
                      <select
                        value={formData.specificType}
                        onChange={(e) => setFormData({ ...formData, specificType: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        <option value="">Any Specific Type</option>
                        {specificTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Category & Priority Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Category
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {CATEGORY_OPTIONS.map((cat) => (
                          <option key={cat || "any"} value={cat}>
                            {cat || "Any Category"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Priority
                      </label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        {PRIORITY_OPTIONS.map((pri) => (
                          <option key={pri || "any"} value={pri}>
                            {pri || "Any Priority"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Assignment Target */}
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary mb-3">Assign To</p>
                  <UserSearchDropdown
                    value={
                      formData.assignToEmail
                        ? { displayName: formData.assignToEmail.split("@")[0], email: formData.assignToEmail }
                        : null
                    }
                    onChange={(user) =>
                      setFormData({ ...formData, assignToEmail: user?.email || "" })
                    }
                    placeholder="Search for user or group..."
                  />
                </div>

                {/* Sort Order & Active */}
                <div className="border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Sort Order
                      </label>
                      <input
                        type="number"
                        value={formData.sortOrder}
                        onChange={(e) =>
                          setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 100 })
                        }
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <p className="text-xs text-text-secondary mt-1">Lower = higher priority</p>
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-text-secondary mb-4">No auto-assignment rules configured yet.</p>
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
                    Conditions
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Assign To
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
                        {rule.title || rule.department || "All Tickets"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.department && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                            {rule.department}
                          </span>
                        )}
                        {rule.subCategory && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                            {rule.subCategory}
                          </span>
                        )}
                        {rule.specificType && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-pink-100 text-pink-800 rounded">
                            {rule.specificType}
                          </span>
                        )}
                        {rule.category && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                            {rule.category}
                          </span>
                        )}
                        {rule.priority && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                            {rule.priority}
                          </span>
                        )}
                        {!rule.department &&
                          !rule.subCategory &&
                          !rule.specificType &&
                          !rule.category &&
                          !rule.priority && (
                            <span className="inline-flex px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">
                              All tickets
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">{rule.assignToEmail}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs rounded ${
                          rule.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
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
