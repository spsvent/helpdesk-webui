"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import {
  fetchVisibilityKeywords,
  createVisibilityKeyword,
  updateVisibilityKeyword,
  deleteVisibilityKeyword,
  createVisibilityKeywordsList,
  VisibilityKeyword,
} from "@/lib/visibilityKeywordsService";

export default function VisibilityKeywordsManager() {
  const { instance, accounts } = useMsal();
  const [keywords, setKeywords] = useState<VisibilityKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listConfigured, setListConfigured] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [newListId, setNewListId] = useState<string | null>(null);

  // New keyword input
  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);

  const loadKeywords = useCallback(async () => {
    if (!accounts[0]) return;

    setLoading(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const data = await fetchVisibilityKeywords(client);
      setKeywords(data);
      setListConfigured(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      if (error.message?.includes("not configured")) {
        setListConfigured(false);
      } else {
        setError("Failed to load keywords: " + (error.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    // Check if env var is set
    if (!process.env.NEXT_PUBLIC_VISIBILITY_KEYWORDS_LIST_ID) {
      setListConfigured(false);
      setLoading(false);
      return;
    }
    loadKeywords();
  }, [loadKeywords]);

  const handleCreateList = async () => {
    if (!accounts[0]) return;
    setCreatingList(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const listId = await createVisibilityKeywordsList(client);
      setNewListId(listId);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to create list: " + (error.message || "Unknown error"));
    } finally {
      setCreatingList(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!accounts[0] || !newKeyword.trim()) return;

    setAdding(true);
    try {
      const client = getGraphClient(instance, accounts[0]);
      const keyword = await createVisibilityKeyword(client, newKeyword.trim().toLowerCase());
      setKeywords((prev) => [...prev, keyword]);
      setNewKeyword("");
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to add keyword: " + (error.message || "Unknown error"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (keyword: VisibilityKeyword) => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await updateVisibilityKeyword(client, keyword.id, { isActive: !keyword.isActive });
      setKeywords((prev) =>
        prev.map((k) => (k.id === keyword.id ? { ...k, isActive: !k.isActive } : k))
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to update keyword: " + (error.message || "Unknown error"));
    }
  };

  const handleDelete = async (keyword: VisibilityKeyword) => {
    if (!accounts[0] || !confirm(`Delete keyword "${keyword.keyword}"?`)) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      await deleteVisibilityKeyword(client, keyword.id);
      setKeywords((prev) => prev.filter((k) => k.id !== keyword.id));
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError("Failed to delete keyword: " + (error.message || "Unknown error"));
    }
  };

  // Not configured state
  if (!listConfigured) {
    return (
      <div className="bg-bg-card rounded-xl p-8">
        <div className="text-center max-w-lg mx-auto">
          {newListId ? (
            <>
              <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Created!</h2>
              <p className="text-text-secondary mb-4">
                The RequestVisibilityKeywords list has been created. Complete these final steps:
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
                      NEXT_PUBLIC_VISIBILITY_KEYWORDS_LIST_ID={newListId}
                    </div>
                  </li>
                  <li>
                    <span className="font-medium">Restart the dev server</span>
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
              <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="text-lg font-medium text-text-primary mb-2">SharePoint List Not Configured</h2>
              <p className="text-text-secondary mb-4">
                The RequestVisibilityKeywords list needs to be created for job title-based visibility.
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
                  "Create RequestVisibilityKeywords List"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl p-8 text-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Loading keywords...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-text-primary">Request Visibility Keywords</h2>
        <p className="text-sm text-text-secondary">
          Users whose Entra ID job title contains any of these keywords can see pending Request tickets (read-only + comment).
          They can also send a &quot;Nudge for Approval&quot; email to GMs.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Add keyword */}
      <div className="bg-bg-card rounded-xl p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
            placeholder="e.g. manager, supervisor, chef"
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            onClick={handleAddKeyword}
            disabled={adding || !newKeyword.trim()}
            className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Keyword"}
          </button>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Keywords are matched case-insensitively against the user&apos;s job title as a substring.
          For example, &quot;manager&quot; matches &quot;Operations Manager&quot;, &quot;Assistant Manager&quot;, etc.
        </p>
      </div>

      {/* Keywords list */}
      <div className="bg-bg-card rounded-xl overflow-hidden">
        {keywords.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-text-secondary">No keywords configured yet.</p>
            <p className="text-sm text-text-secondary mt-2">
              Add keywords above to allow users with matching job titles to see pending requests.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {keywords.map((keyword) => (
              <div key={keyword.id} className="flex items-center justify-between p-4 hover:bg-bg-subtle transition-colors">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(keyword)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      keyword.isActive ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        keyword.isActive ? "translate-x-4" : ""
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${keyword.isActive ? "text-text-primary" : "text-text-secondary line-through"}`}>
                    {keyword.keyword}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(keyword)}
                  className="p-1.5 text-text-secondary hover:text-red-600 rounded transition-colors"
                  title="Delete keyword"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-medium mb-1">How it works</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>When a user logs in, their Entra ID job title is checked against active keywords</li>
          <li>If matched, they can see pending Request tickets in their ticket list</li>
          <li>They can comment on these tickets but cannot change status or assignment</li>
          <li>They can send a &quot;Nudge for Approval&quot; email to GMs (once per 24 hours per ticket)</li>
        </ul>
      </div>
    </div>
  );
}
