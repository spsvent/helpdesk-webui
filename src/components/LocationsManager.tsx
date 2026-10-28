"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient } from "@/lib/graphClient";
import { LOCATION_OPTIONS, mergeLocations } from "@/lib/locationConfig";
import {
  fetchCustomLocations,
  addCustomLocation,
  deleteCustomLocation,
  CustomLocation,
} from "@/lib/locationService";

export default function LocationsManager() {
  const { instance, accounts } = useMsal();
  const [custom, setCustom] = useState<CustomLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!accounts[0]) return;
    setLoading(true);
    setError(null);
    try {
      setCustom(await fetchCustomLocations(getGraphClient(instance, accounts[0])));
    } catch (err: unknown) {
      setError("Failed to load locations: " + ((err as { message?: string }).message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [accounts, instance]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!accounts[0] || !name) return;
    if (mergeLocations(custom.map((c) => c.name)).some((l) => l.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already a location.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const loc = await addCustomLocation(getGraphClient(instance, accounts[0]), name);
      setCustom((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err: unknown) {
      setError("Failed to add location: " + ((err as { message?: string }).message || "Unknown error"));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (loc: CustomLocation) => {
    if (!accounts[0] || !confirm(`Remove "${loc.name}" from the location dropdown? Existing tickets keep their location.`)) return;
    try {
      await deleteCustomLocation(getGraphClient(instance, accounts[0]), loc.id);
      setCustom((prev) => prev.filter((c) => c.id !== loc.id));
    } catch (err: unknown) {
      setError("Failed to remove location: " + ((err as { message?: string }).message || "Unknown error"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-text-primary">Locations</h2>
        <p className="text-sm text-text-secondary">
          Locations added here appear in the Location dropdown on the new ticket form, sorted A–Z with the built-in
          locations.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="bg-bg-card rounded-xl p-4 flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New location name (e.g. Last Stop Shop (Exit Shop))"
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-brand-primary text-white text-sm rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 whitespace-nowrap"
        >
          {adding ? "Adding..." : "Add Location"}
        </button>
      </div>

      <div className="bg-bg-card rounded-xl overflow-hidden">
        <div className="px-4 py-2 text-xs font-medium uppercase text-text-secondary bg-bg-subtle">Added by admins</div>
        {loading ? (
          <div className="p-6 text-center text-text-secondary text-sm">Loading...</div>
        ) : custom.length === 0 ? (
          <div className="p-6 text-center text-text-secondary text-sm">No custom locations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {custom.map((loc) => (
              <div key={loc.id} className="flex items-center justify-between p-3 hover:bg-bg-subtle">
                <span className="text-sm text-text-primary">{loc.name}</span>
                <button
                  onClick={() => handleDelete(loc)}
                  className="text-sm text-text-secondary hover:text-red-600"
                  title="Remove location"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="bg-bg-card rounded-xl p-4">
        <summary className="text-sm font-medium text-text-primary cursor-pointer">
          Built-in locations ({LOCATION_OPTIONS.length})
        </summary>
        <ul className="mt-3 columns-1 sm:columns-2 gap-6 text-sm text-text-secondary">
          {LOCATION_OPTIONS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
