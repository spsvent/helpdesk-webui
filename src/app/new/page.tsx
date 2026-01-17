"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msalConfig";
import { getGraphClient, createTicket, CreateTicketData } from "@/lib/graphClient";

const CATEGORY_OPTIONS = ["Request", "Problem"] as const;

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low", description: "Nice to have, no rush" },
  { value: "Normal", label: "Normal", description: "Standard priority, address within normal workflow" },
  { value: "High", label: "High", description: "Important issue requiring prompt attention" },
  { value: "Urgent", label: "Urgent", description: "Drop everything - full company resources, critical business impact" },
] as const;

const PROBLEM_TYPE_OPTIONS = [
  "Tech",
  "Operations",
  "Marketing",
  "Grounds Keeping",
  "HR",
  "Customer Service",
  "Joshua Weldon",
  "Other",
] as const;

const LOCATION_OPTIONS = [
  "Admissions",
  "Bakery",
  "Billy's BBQ",
  "Bridal Suite",
  "CoachWorks",
  "Frozen Falls",
  "Kringle's Coffee",
  "Sky Shop",
  "Top of the World",
  "Toy Test Track",
  "Zipline",
  "Other",
] as const;

export default function NewTicketPage() {
  const router = useRouter();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [formData, setFormData] = useState<CreateTicketData>({
    title: "",
    description: "",
    category: "Request",
    priority: "Normal",
    problemType: "Tech",
    location: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrgentTooltip, setShowUrgentTooltip] = useState(false);

  const handleLogin = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accounts[0]) {
      setError("You must be signed in to submit a ticket");
      return;
    }

    if (!formData.title.trim()) {
      setError("Please enter a title for your ticket");
      return;
    }

    if (!formData.description.trim()) {
      setError("Please describe your issue");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const newTicket = await createTicket(client, formData);

      // Redirect to the main page with the new ticket selected
      router.push(`/?ticket=${newTicket.id}`);
    } catch (e) {
      console.error("Failed to create ticket:", e);
      setError("Failed to submit ticket. Please try again.");
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Show loading while MSAL initializes
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto"></div>
          <p className="mt-4 text-text-secondary">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Submit a Support Ticket
          </h1>
          <p className="text-text-secondary mb-6">
            Sign in with your Microsoft account to submit a support request.
          </p>
          <button
            onClick={handleLogin}
            className="bg-brand-blue hover:bg-brand-blue-light text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-subtle">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-brand-blue hover:text-brand-blue-light transition-colors"
          >
            ← Back to Tickets
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">
            Submit New Ticket
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">
            {accounts[0]?.name || accounts[0]?.username}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-border p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-6">
              Describe Your Issue
            </h2>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Brief summary of your issue"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Please describe your issue in detail. Include any error messages, steps to reproduce, or relevant context."
                  rows={6}
                  className="w-full px-3 py-2 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  required
                />
              </div>

              {/* Category and Problem Type row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Category */}
                <div>
                  <label
                    htmlFor="category"
                    className="block text-sm font-medium text-text-primary mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-secondary">
                    Request = new feature/access; Problem = something is broken
                  </p>
                </div>

                {/* Problem Type */}
                <div>
                  <label
                    htmlFor="problemType"
                    className="block text-sm font-medium text-text-primary mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="problemType"
                    name="problemType"
                    value={formData.problemType}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                  >
                    {PROBLEM_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-secondary">
                    Which team should handle this?
                  </p>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Priority
                </label>
                <div className="space-y-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.priority === opt.value
                          ? "border-brand-blue bg-blue-50"
                          : "border-border hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="priority"
                        value={opt.value}
                        checked={formData.priority === opt.value}
                        onChange={handleChange}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium ${
                              opt.value === "Urgent"
                                ? "text-red-600"
                                : opt.value === "High"
                                ? "text-orange-600"
                                : opt.value === "Low"
                                ? "text-gray-500"
                                : "text-text-primary"
                            }`}
                          >
                            {opt.label}
                          </span>
                          {opt.value === "Urgent" && (
                            <div className="relative">
                              <button
                                type="button"
                                onMouseEnter={() => setShowUrgentTooltip(true)}
                                onMouseLeave={() => setShowUrgentTooltip(false)}
                                onClick={() => setShowUrgentTooltip(!showUrgentTooltip)}
                                className="text-red-400 hover:text-red-600"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              </button>
                              {showUrgentTooltip && (
                                <div className="absolute left-6 top-0 z-10 w-64 p-3 bg-red-900 text-white text-xs rounded-lg shadow-lg">
                                  <p className="font-bold mb-1">⚠️ Use Sparingly!</p>
                                  <p>
                                    Urgent means drop everything. Full company resources
                                    will be redirected to this issue. This should only be
                                    used for critical business impact such as:
                                  </p>
                                  <ul className="mt-2 list-disc list-inside">
                                    <li>Complete system outages</li>
                                    <li>Safety concerns</li>
                                    <li>Revenue-impacting issues</li>
                                    <li>Time-sensitive events</li>
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-text-secondary">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label
                  htmlFor="location"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  Location <span className="text-text-secondary">(optional)</span>
                </label>
                <select
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                >
                  <option value="">Select a location...</option>
                  {LOCATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-secondary">
                  Where is the issue occurring?
                </p>
              </div>

              {/* Submit button */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <Link
                    href="/"
                    className="text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-brand-blue text-white rounded-lg font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
