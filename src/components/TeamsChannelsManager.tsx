"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { getProblemTypes } from "@/lib/categoryConfig";
import { TeamsChannelConfig, TeamsMinPriority } from "@/types/teams";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";
const TEAMS_CHANNELS_LIST_ID = process.env.NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID || "";

interface ChannelFormData {
  title: string;
  department: string;
  teamsUrl: string;
  teamId: string;
  channelId: string;
  minPriority: TeamsMinPriority;
  isActive: boolean;
}

const EMPTY_FORM: ChannelFormData = {
  title: "",
  department: "",
  teamsUrl: "",
  teamId: "",
  channelId: "",
  minPriority: "Normal",
  isActive: true,
};

const PRIORITY_OPTIONS: TeamsMinPriority[] = ["Low", "Normal", "High", "Urgent"];

/**
 * Parse a Teams channel URL and extract TeamId and ChannelId
 */
function parseTeamsUrl(url: string): { teamId: string; channelId: string } | null {
  try {
    // Example URL:
    // https://teams.microsoft.com/l/channel/19%3A00253cfab7d54da09286a7167e7866b5%40thread.tacv2/HelpDesk?groupId=7e1b9f86-5fc0-4f83-a6d2-e52167d0e4cf&tenantId=...

    const urlObj = new URL(url);

    // Extract groupId (TeamId) from query params
    const teamId = urlObj.searchParams.get("groupId");

    // Extract channelId from path - it's URL encoded
    const pathParts = urlObj.pathname.split("/");
    const channelIndex = pathParts.indexOf("channel");

    if (channelIndex === -1 || !pathParts[channelIndex + 1]) {
      return null;
    }

    // Decode the channel ID (convert %3A to : and %40 to @)
    const channelId = decodeURIComponent(pathParts[channelIndex + 1]);

    if (!teamId || !channelId) {
      return null;
    }

    return { teamId, channelId };
  } catch {
    return null;
  }
}

/**
 * Extract channel name from Teams URL
 */
function extractChannelName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const channelIndex = pathParts.indexOf("channel");

    if (channelIndex !== -1 && pathParts[channelIndex + 2]) {
      return decodeURIComponent(pathParts[channelIndex + 2]);
    }
    return "";
  } catch {
    return "";
  }
}

export default function TeamsChannelsManager() {
  const { instance, accounts } = useMsal();
  const [channels, setChannels] = useState<(TeamsChannelConfig & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<(TeamsChannelConfig & { id: string }) | null>(null);
  const [formData, setFormData] = useState<ChannelFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const departments = getProblemTypes();

  // Load channels
  const loadChannels = useCallback(async () => {
    if (!accounts[0]) return;

    setLoading(true);
    setError(null);

    try {
      if (!TEAMS_CHANNELS_LIST_ID) {
        setListConfigured(false);
        setLoading(false);
        return;
      }

      const client = getGraphClient(instance, accounts[0]);
      const endpoint = `/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items?$expand=fields`;
      const response = await client.api(endpoint).get();

      const data = response.value.map((item: {
        id: string;
        fields: {
          Title?: string;
          Department?: string;
          TeamId?: string;
          ChannelId?: string;
          IsActive?: boolean;
          MinPriority?: string;
        };
      }) => ({
        id: item.id,
        title: item.fields.Title || "",
        department: item.fields.Department || "",
        teamId: item.fields.TeamId || "",
        channelId: item.fields.ChannelId || "",
        isActive: item.fields.IsActive ?? false,
        minPriority: (item.fields.MinPriority as TeamsMinPriority) || "Normal",
      }));

      setChannels(data);
      setListConfigured(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error.message?.includes("does not exist") || error.message?.includes("not found")) {
        setListConfigured(false);
      } else {
        setError("Failed to load channels: " + (error.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, [instance, accounts]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Handle URL paste and auto-parse
  const handleUrlChange = (url: string) => {
    setFormData((prev) => ({ ...prev, teamsUrl: url }));
    setUrlError(null);

    if (!url.trim()) {
      setFormData((prev) => ({ ...prev, teamId: "", channelId: "" }));
      return;
    }

    const parsed = parseTeamsUrl(url);
    if (parsed) {
      const channelName = extractChannelName(url);
      setFormData((prev) => ({
        ...prev,
        teamId: parsed.teamId,
        channelId: parsed.channelId,
        title: prev.title || (channelName ? `${channelName} Channel` : ""),
      }));
    } else {
      setUrlError("Invalid Teams URL. Please copy the full URL from Teams.");
      setFormData((prev) => ({ ...prev, teamId: "", channelId: "" }));
    }
  };

  // Create SharePoint list
  const handleCreateList = async () => {
    if (!accounts[0]) return;

    setCreatingList(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);

      const listDefinition = {
        displayName: "TeamsChannels",
        columns: [
          { name: "Department", text: { maxLength: 100 } },
          { name: "TeamId", text: { maxLength: 100 } },
          { name: "ChannelId", text: { maxLength: 200 } },
          { name: "IsActive", boolean: {} },
          {
            name: "MinPriority",
            choice: {
              choices: ["Low", "Normal", "High", "Urgent"],
              displayAs: "dropDownMenu",
            },
          },
        ],
        list: { template: "genericList" },
      };

      const response = await client.api(`/sites/${SITE_ID}/lists`).post(listDefinition);
      setNewListId(response.id);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to create list: " + (error.message || "Unknown error"));
    } finally {
      setCreatingList(false);
    }
  };

  // Save channel (create or update)
  const handleSave = async () => {
    if (!accounts[0]) return;

    // Validate
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!formData.department) {
      setError("Department is required");
      return;
    }
    if (!formData.teamId || !formData.channelId) {
      setError("Please paste a valid Teams channel URL");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);

      const fields = {
        Title: formData.title,
        Department: formData.department,
        TeamId: formData.teamId,
        ChannelId: formData.channelId,
        IsActive: formData.isActive,
        MinPriority: formData.minPriority,
      };

      if (editingChannel) {
        // Update existing
        await client
          .api(`/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items/${editingChannel.id}/fields`)
          .patch(fields);
      } else {
        // Create new
        await client
          .api(`/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items`)
          .post({ fields });
      }

      setShowForm(false);
      setEditingChannel(null);
      setFormData(EMPTY_FORM);
      await loadChannels();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to save: " + (error.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  // Delete channel
  const handleDelete = async (id: string) => {
    if (!accounts[0]) return;
    if (!confirm("Are you sure you want to delete this channel configuration?")) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await client
        .api(`/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items/${id}`)
        .delete();
      await loadChannels();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to delete: " + (error.message || "Unknown error"));
    }
  };

  // Toggle active status
  const handleToggleActive = async (channel: TeamsChannelConfig & { id: string }) => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await client
        .api(`/sites/${SITE_ID}/lists/${TEAMS_CHANNELS_LIST_ID}/items/${channel.id}/fields`)
        .patch({ IsActive: !channel.isActive });
      await loadChannels();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to update: " + (error.message || "Unknown error"));
    }
  };

  // Test channel by sending a test notification
  const handleTestChannel = async (channel: TeamsChannelConfig & { id: string }) => {
    if (!accounts[0]) return;

    setTestingChannel(channel.id);
    setTestResult(null);

    try {
      const client = getGraphClient(instance, accounts[0]);

      const testCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.4",
        body: [
          {
            type: "Container",
            style: "good",
            bleed: true,
            padding: "default",
            items: [
              {
                type: "TextBlock",
                text: "Test Notification",
                size: "medium",
                weight: "bolder",
                color: "light",
              },
            ],
          },
          {
            type: "TextBlock",
            text: "This is a test notification from the Help Desk system.",
            wrap: true,
            spacing: "medium",
          },
          {
            type: "FactSet",
            facts: [
              { title: "Channel", value: channel.title },
              { title: "Department", value: channel.department },
              { title: "Min Priority", value: channel.minPriority },
            ],
          },
        ],
      };

      const endpoint = `/teams/${channel.teamId}/channels/${channel.channelId}/messages`;
      const message = {
        body: {
          contentType: "html",
          content: "<attachment id=\"card\"></attachment>",
        },
        attachments: [
          {
            id: "card",
            contentType: "application/vnd.microsoft.card.adaptive",
            content: JSON.stringify(testCard),
          },
        ],
      };

      await client.api(endpoint).post(message);
      setTestResult({ success: true, message: "Test notification sent successfully!" });
    } catch (err: unknown) {
      const error = err as { message?: string };
      setTestResult({ success: false, message: error.message || "Failed to send test" });
    } finally {
      setTestingChannel(null);
    }
  };

  // Edit channel
  const handleEdit = (channel: TeamsChannelConfig & { id: string }) => {
    setEditingChannel(channel);
    setFormData({
      title: channel.title,
      department: channel.department,
      teamsUrl: "",
      teamId: channel.teamId,
      channelId: channel.channelId,
      minPriority: channel.minPriority,
      isActive: channel.isActive,
    });
    setShowForm(true);
    setUrlError(null);
  };

  // Cancel form
  const handleCancel = () => {
    setShowForm(false);
    setEditingChannel(null);
    setFormData(EMPTY_FORM);
    setUrlError(null);
    setError(null);
  };

  // If list not configured, show setup instructions
  if (!listConfigured) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Teams Channel Notifications</h2>

        {newListId ? (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
              List Created Successfully!
            </h3>
            <p className="text-green-700 dark:text-green-300 mb-3">
              Add this List ID to your environment variables:
            </p>
            <code className="block bg-green-100 dark:bg-green-900 p-3 rounded text-sm font-mono break-all">
              NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID={newListId}
            </code>
            <p className="text-green-600 dark:text-green-400 mt-3 text-sm">
              After adding to GitHub secrets and redeploying, refresh this page.
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              Teams Channels List Not Configured
            </h3>
            <p className="text-yellow-700 dark:text-yellow-300 mb-4">
              Create the TeamsChannels SharePoint list to manage Teams notifications.
            </p>
            <button
              onClick={handleCreateList}
              disabled={creatingList}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {creatingList ? "Creating..." : "Create TeamsChannels List"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold dark:text-white">Teams Channel Notifications</h2>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingChannel(null);
              setFormData(EMPTY_FORM);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
          >
            + Add Channel
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {testResult && (
        <div
          className={`mb-4 border rounded-lg p-3 ${
            testResult.success
              ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
          }`}
        >
          <p
            className={`text-sm ${
              testResult.success
                ? "text-green-700 dark:text-green-300"
                : "text-red-700 dark:text-red-300"
            }`}
          >
            {testResult.message}
          </p>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-6 border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
          <h3 className="font-semibold mb-4 dark:text-white">
            {editingChannel ? "Edit Channel" : "Add New Channel"}
          </h3>

          <div className="space-y-4">
            {/* Teams URL Input */}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                Teams Channel URL *
              </label>
              <input
                type="text"
                value={formData.teamsUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="Paste Teams channel link here..."
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
              />
              {urlError && <p className="text-red-500 text-xs mt-1">{urlError}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Right-click a channel in Teams → &quot;Get link to channel&quot; → paste here
              </p>
            </div>

            {/* Parsed IDs (read-only display) */}
            {(formData.teamId || formData.channelId) && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-2">
                  Parsed IDs:
                </p>
                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-green-600 dark:text-green-400">TeamId:</span>{" "}
                    <span className="text-green-800 dark:text-green-200">{formData.teamId}</span>
                  </div>
                  <div>
                    <span className="text-green-600 dark:text-green-400">ChannelId:</span>{" "}
                    <span className="text-green-800 dark:text-green-200 break-all">
                      {formData.channelId}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                Display Name *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Tech Support Channel"
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                Department *
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
              >
                <option value="">Select department...</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tickets with this department will notify this channel
              </p>
            </div>

            {/* Min Priority */}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                Minimum Priority
              </label>
              <select
                value={formData.minPriority}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minPriority: e.target.value as TeamsMinPriority,
                  }))
                }
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Only tickets at or above this priority will notify
              </p>
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="isActive" className="text-sm dark:text-gray-200">
                Active (notifications enabled)
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !formData.teamId || !formData.channelId}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
              >
                {saving ? "Saving..." : editingChannel ? "Update" : "Add Channel"}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : channels.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No channels configured. Click &quot;Add Channel&quot; to set up Teams notifications.
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={`border dark:border-gray-700 rounded-lg p-4 ${
                channel.isActive ? "bg-white dark:bg-gray-800" : "bg-gray-100 dark:bg-gray-700/50"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold dark:text-white">{channel.title}</h3>
                    {!channel.isActive && (
                      <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Department:</span>{" "}
                      <span className="dark:text-gray-200">{channel.department}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Min Priority:</span>{" "}
                      <span
                        className={`font-medium ${
                          channel.minPriority === "Urgent"
                            ? "text-red-600 dark:text-red-400"
                            : channel.minPriority === "High"
                            ? "text-orange-600 dark:text-orange-400"
                            : "dark:text-gray-200"
                        }`}
                      >
                        {channel.minPriority}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                    {channel.channelId}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleTestChannel(channel)}
                    disabled={testingChannel === channel.id || !channel.isActive}
                    className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 text-sm disabled:opacity-50"
                  >
                    {testingChannel === channel.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    onClick={() => handleToggleActive(channel)}
                    className={`px-3 py-1 rounded text-sm ${
                      channel.isActive
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                    }`}
                  >
                    {channel.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleEdit(channel)}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(channel.id)}
                    className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">How Teams Notifications Work</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Each department can have one Teams channel for notifications</li>
          <li>• Notifications are sent for: new tickets, status changes, priority escalations</li>
          <li>• Only tickets at or above the minimum priority threshold will notify</li>
          <li>• Channel configuration is cached for 5 minutes</li>
        </ul>
      </div>
    </div>
  );
}
