"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msalConfig";
import { isRunningInTeams, openTeamsAuthPopup } from "@/lib/teamsAuth";
import { getGraphClient, createTicket, CreateTicketData, CreateTicketOptions, addAssignmentComment, logActivity, uploadAttachment, addComment } from "@/lib/graphClient";
import { useRBAC } from "@/contexts/RBACContext";
import { sendNewTicketEmail, sendApprovalRequestEmail } from "@/lib/emailService";
import { sendNewTicketTeamsNotification } from "@/lib/teamsService";
import {
  getProblemTypes,
  getProblemTypeSubs,
  getProblemTypeSub2s,
  hasSubCategories,
  hasSub2Categories,
} from "@/lib/categoryConfig";
import { getSuggestedAssigneeWithGroup } from "@/lib/autoAssignConfig";
import { fetchAutoAssignConfig, getSuggestedAssigneeFromConfig } from "@/lib/autoAssignConfigService";
import { suggestCategory, getSuggestionMessage } from "@/lib/categorySuggestion";
import AssigneePreview from "@/components/AssigneePreview";
import LoadingSpinner from "@/components/LoadingSpinner";
import AttachmentUpload from "@/components/AttachmentUpload";
import StagedAttachmentList from "@/components/StagedAttachmentList";

const CATEGORY_OPTIONS = ["Request", "Problem"] as const;

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low", description: "Nice to have, no rush" },
  { value: "Normal", label: "Normal", description: "Standard priority, address within normal workflow" },
  { value: "High", label: "High", description: "Important issue requiring prompt attention" },
  { value: "Urgent", label: "Urgent", description: "Drop everything - full company resources, critical business impact" },
] as const;

import { LOCATION_OPTIONS } from "@/lib/locationConfig";

export default function NewTicketPage() {
  const router = useRouter();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { permissions } = useRBAC();
  const isAdmin = permissions?.role === "admin";

  const [formData, setFormData] = useState<CreateTicketData>(() => {
    // Check for pre-fill data from debug report
    if (typeof window !== "undefined") {
      const preFillData = sessionStorage.getItem("newTicketPreFill");
      if (preFillData) {
        sessionStorage.removeItem("newTicketPreFill");
        try {
          const parsed = JSON.parse(preFillData);
          return {
            title: parsed.title || "",
            description: parsed.description || "",
            category: parsed.category || "Problem",
            priority: parsed.priority || "Normal",
            problemType: parsed.problemType || "Tech",
            problemTypeSub: parsed.problemTypeSub || "",
            problemTypeSub2: parsed.problemTypeSub2 || "",
            location: parsed.location || "",
          };
        } catch {
          // Invalid JSON, use defaults
        }
      }
    }
    return {
      title: "",
      description: "",
      category: "Request",
      priority: "Normal",
      problemType: "Tech",
      problemTypeSub: "",
      problemTypeSub2: "",
      location: "",
    };
  });

  // Cascading dropdown options
  const [problemTypeSubs, setProblemTypeSubs] = useState<string[]>([]);
  const [problemTypeSub2s, setProblemTypeSub2s] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUrgentTooltip, setShowUrgentTooltip] = useState(false);

  // Staged files for upload after ticket creation
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const handleStageFile = async (file: File): Promise<boolean> => {
    setStagedFiles((prev) => [...prev, file]);
    return true;
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };
  const [categorySuggestion, setCategorySuggestion] = useState<{
    category: "Problem" | "Request" | null;
    message: string | null;
    dismissed: boolean;
  }>({ category: null, message: null, dismissed: false });

  // Compute suggested assignee based on current form selections
  const suggestedAssignee = useMemo(() => {
    return getSuggestedAssigneeWithGroup(
      formData.problemType,
      formData.problemTypeSub || undefined,
      formData.problemTypeSub2 || undefined,
      formData.category
    );
  }, [formData.problemType, formData.problemTypeSub, formData.problemTypeSub2, formData.category]);

  // Create Graph client for assignee preview lookup
  const graphClient = useMemo(() => {
    if (accounts[0]) {
      return getGraphClient(instance, accounts[0]);
    }
    return null;
  }, [instance, accounts]);

  // Pre-fetch auto-assign config on mount (avoid fetch during submit)
  const [autoAssignConfig, setAutoAssignConfig] = useState<Awaited<ReturnType<typeof fetchAutoAssignConfig>> | null>(null);
  useEffect(() => {
    if (graphClient) {
      fetchAutoAssignConfig(graphClient)
        .then(setAutoAssignConfig)
        .catch((err) => console.warn("Failed to pre-fetch auto-assign config:", err));
    }
  }, [graphClient]);

  // Update sub-category options when problemType changes
  useEffect(() => {
    const subs = getProblemTypeSubs(formData.problemType);
    setProblemTypeSubs(subs);
    // Only reset sub selection if current value is not valid for the new problemType
    setFormData((prev) => {
      const currentSubIsValid = prev.problemTypeSub && subs.includes(prev.problemTypeSub);
      if (currentSubIsValid) {
        return prev; // Keep the current valid selection
      }
      return {
        ...prev,
        problemTypeSub: subs.length > 0 ? subs[0] : "",
        problemTypeSub2: "",
      };
    });
  }, [formData.problemType]);

  // Update sub2 options when problemTypeSub changes
  useEffect(() => {
    if (formData.problemType && formData.problemTypeSub) {
      const sub2s = getProblemTypeSub2s(formData.problemType, formData.problemTypeSub);
      setProblemTypeSub2s(sub2s);
      // Only reset sub2 selection if current value is not valid
      setFormData((prev) => {
        const currentSub2IsValid = prev.problemTypeSub2 && sub2s.includes(prev.problemTypeSub2);
        if (currentSub2IsValid) {
          return prev; // Keep the current valid selection
        }
        return {
          ...prev,
          problemTypeSub2: "",
        };
      });
    } else {
      setProblemTypeSub2s([]);
    }
  }, [formData.problemType, formData.problemTypeSub]);

  // Analyze title + description for category suggestion
  useEffect(() => {
    const combinedText = `${formData.title} ${formData.description}`;
    if (combinedText.trim().length < 10) {
      // Not enough text to analyze
      setCategorySuggestion({ category: null, message: null, dismissed: false });
      return;
    }

    const result = suggestCategory(combinedText);
    const message = getSuggestionMessage(result);

    // Only show suggestion if it differs from current selection and wasn't dismissed
    if (result.suggestedCategory && result.suggestedCategory !== formData.category) {
      setCategorySuggestion((prev) => ({
        category: result.suggestedCategory,
        message,
        dismissed: prev.dismissed && prev.category === result.suggestedCategory,
      }));
    } else {
      setCategorySuggestion({ category: null, message: null, dismissed: false });
    }
  }, [formData.title, formData.description, formData.category]);

  const handleLogin = async () => {
    try {
      if (isRunningInTeams()) {
        console.log("Running in Teams, using Teams SDK auth popup");
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
        await instance.loginRedirect(loginRequest);
      }
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

    // Validate that sub-category is selected if available
    if (hasSubCategories(formData.problemType) && !formData.problemTypeSub) {
      setError("Please select a sub-category");
      return;
    }

    // Validate location is selected
    if (!formData.location) {
      setError("Please select a location");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const client = getGraphClient(instance, accounts[0]);
      const requesterEmail = accounts[0]?.username;

      // Get auto-assignment based on department/category
      // Use pre-fetched config, or try to fetch if not available
      let assigneeEmail: string | null = null;
      const config = autoAssignConfig ?? await fetchAutoAssignConfig(client).catch(() => null);
      if (config && config.rules.length > 0) {
        assigneeEmail = getSuggestedAssigneeFromConfig(
          config,
          formData.problemType,
          formData.problemTypeSub || undefined,
          formData.problemTypeSub2 || undefined,
          formData.category,
          formData.priority
        );
      }

      // Fall back to hardcoded rules if no SharePoint match
      if (!assigneeEmail) {
        const assigneeResult = getSuggestedAssigneeWithGroup(
          formData.problemType,
          formData.problemTypeSub || undefined,
          formData.problemTypeSub2 || undefined,
          formData.category
        );
        assigneeEmail = assigneeResult?.email || null;
      }

      // Build options for ticket creation (auto-approval for admin Problem tickets)
      const createOptions: CreateTicketOptions = {
        isAdmin,
        creatorEmail: requesterEmail,
      };

      const newTicket = await createTicket(
        client,
        { ...formData, assigneeEmail: assigneeEmail || undefined },
        requesterEmail,
        createOptions
      );

      // Parallelize post-creation activities for faster response
      const requesterName = accounts[0]?.name || accounts[0]?.username || "Unknown User";

      // Build array of parallel post-creation tasks
      const postCreationTasks: Promise<void>[] = [];

      // 1. Log ticket creation (non-blocking)
      postCreationTasks.push(
        logActivity(client, {
          eventType: "ticket_created",
          ticketId: newTicket.id,
          ticketNumber: newTicket.ticketNumber?.toString(),
          actor: requesterEmail,
          actorName: requesterName,
          description: `Created ticket: ${newTicket.title}`,
          details: JSON.stringify({
            category: formData.category,
            priority: formData.priority,
            department: formData.problemType,
            assignedTo: assigneeEmail || "Unassigned",
          }),
        }).catch((err) => console.error("Failed to log ticket creation:", err))
      );

      // 2. Send Teams notification (fire-and-forget)
      sendNewTicketTeamsNotification(client, newTicket);

      // 3. Send email notification to assignee if there is one
      if (assigneeEmail) {
        postCreationTasks.push(
          (async () => {
            try {
              // Derive display name from email - skip API lookup to avoid 404s for groups
              // Format: "itav@domain.com" -> "Itav", "john.doe@domain.com" -> "John Doe"
              const localPart = assigneeEmail.split('@')[0];
              const assigneeName = localPart
                .replace(/[._]/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());

              // Send email
              await sendNewTicketEmail(client, newTicket, assigneeEmail, assigneeName);

              // Log email sent and add comment in parallel
              await Promise.all([
                logActivity(client, {
                  eventType: "email_sent",
                  ticketId: newTicket.id,
                  ticketNumber: newTicket.ticketNumber?.toString(),
                  actor: "system",
                  actorName: "System",
                  description: `Assignment notification sent to ${assigneeName}`,
                  details: JSON.stringify({ recipient: assigneeEmail, type: "new_ticket_assignment" }),
                }),
                addAssignmentComment(client, parseInt(newTicket.id), "System", assigneeName, assigneeEmail),
              ]);
            } catch (emailError) {
              console.error("Failed to send assignment email:", emailError);
            }
          })()
        );
      }

      // 4. For Request tickets, send approval notification
      if (formData.category === "Request") {
        postCreationTasks.push(
          (async () => {
            try {
              await sendApprovalRequestEmail(client, newTicket, requesterName);
              await logActivity(client, {
                eventType: "approval_requested",
                ticketId: newTicket.id,
                ticketNumber: newTicket.ticketNumber?.toString(),
                actor: requesterEmail,
                actorName: requesterName,
                description: `Approval request sent to managers`,
                details: JSON.stringify({ category: "Request" }),
              });
            } catch (approvalEmailError) {
              console.error("Failed to send approval request email:", approvalEmailError);
            }
          })()
        );
      }

      // 5. Upload staged attachments if any
      if (stagedFiles.length > 0) {
        setSubmitStatus(`Uploading ${stagedFiles.length} attachment${stagedFiles.length !== 1 ? "s" : ""}...`);
        const uploadResults = await Promise.allSettled(
          stagedFiles.map((file) =>
            uploadAttachment(client, newTicket.id, file, instance, accounts[0])
          )
        );

        const failedUploads = uploadResults.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === null));
        if (failedUploads.length > 0) {
          console.warn(`${failedUploads.length} of ${stagedFiles.length} attachment uploads failed`);
          // Add internal note about failed uploads
          postCreationTasks.push(
            addComment(
              client,
              parseInt(newTicket.id),
              `[System] ${failedUploads.length} of ${stagedFiles.length} attachment(s) failed to upload during ticket creation.`,
              true
            ).catch((err) => console.error("Failed to add attachment failure note:", err))
          );
        }
      }

      // Wait for all post-creation tasks (don't block redirect on failure)
      await Promise.allSettled(postCreationTasks);

      // Redirect to the main page with the new ticket selected
      router.push(`/?ticket=${newTicket.id}`);
    } catch (e: unknown) {
      console.error("Failed to create ticket:", e);

      // Try to provide a more helpful error message based on the error type
      const err = e as { statusCode?: number; code?: string; message?: string };

      if (err.statusCode === 403 || err.code === "accessDenied") {
        setError("You don't have permission to create tickets. Please contact your administrator to request access.");
      } else if (err.statusCode === 401 || err.code === "InvalidAuthenticationToken") {
        setError("Your session has expired. Please refresh the page and sign in again.");
      } else {
        setError("Failed to submit ticket. Please try again or contact support if the problem persists.");
      }
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
        <LoadingSpinner message="Authenticating..." size="large" />
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
        <div className="bg-bg-card p-8 rounded-lg shadow-lg text-center max-w-md">
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

  const showProblemTypeSub = hasSubCategories(formData.problemType);
  const showProblemTypeSub2 = showProblemTypeSub && hasSub2Categories(formData.problemType, formData.problemTypeSub || "");

  return (
    <div className="min-h-screen flex flex-col bg-bg-subtle">
      {/* Header */}
      <header className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
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
          <div className="bg-bg-card rounded-lg shadow-sm border border-border p-6">
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

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Category <span className="text-red-500">*</span>
                </label>

                {/* Smart Category Suggestion */}
                {categorySuggestion.category && categorySuggestion.message && !categorySuggestion.dismissed && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-amber-800">
                        <strong>Suggestion:</strong> {categorySuggestion.message}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, category: categorySuggestion.category! }));
                            setCategorySuggestion({ category: null, message: null, dismissed: false });
                          }}
                          className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                        >
                          Switch to {categorySuggestion.category}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategorySuggestion((prev) => ({ ...prev, dismissed: true }))}
                          className="px-3 py-1 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          Keep {formData.category}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.category === "Problem"
                        ? "border-brand-primary bg-brand-primary/10"
                        : "border-border hover:bg-bg-subtle"
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value="Problem"
                      checked={formData.category === "Problem"}
                      onChange={handleChange}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-text-primary">Problem</span>
                      <p className="text-sm text-text-secondary mt-0.5">
                        Something is broken, not working, or needs fixing
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        Examples: Equipment failure, software error, system outage, bug
                      </p>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.category === "Request"
                        ? "border-brand-primary bg-brand-primary/10"
                        : "border-border hover:bg-bg-subtle"
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value="Request"
                      checked={formData.category === "Request"}
                      onChange={handleChange}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-text-primary">Request</span>
                      <p className="text-sm text-text-secondary mt-0.5">
                        Need something new, changed, or set up
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        Examples: New equipment, access request, software install, permission change
                      </p>
                    </div>
                  </label>
                </div>
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> {formData.category === "Request" ? (
                      <>Requests require manager approval before support staff can see them. You&apos;ll be notified when approved.</>
                    ) : (
                      <>Problems are routed directly to support staff and will be addressed promptly.</>
                    )}
                  </p>
                </div>
              </div>

              {/* Department (Problem Type) - 3-level cascading dropdowns */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm font-medium text-text-primary">
                  Department & Category <span className="text-red-500">*</span>
                </div>

                {/* Level 1: Problem Type (Department) */}
                <div>
                  <label
                    htmlFor="problemType"
                    className="block text-xs font-medium text-text-secondary mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="problemType"
                    name="problemType"
                    value={formData.problemType}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent bg-bg-card"
                  >
                    {getProblemTypes().map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Level 2: Problem Type Sub */}
                {showProblemTypeSub && (
                  <div>
                    <label
                      htmlFor="problemTypeSub"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      Sub-Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="problemTypeSub"
                      name="problemTypeSub"
                      value={formData.problemTypeSub}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent bg-bg-card"
                      required
                    >
                      {problemTypeSubs.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Level 3: Problem Type Sub 2 (optional) */}
                {showProblemTypeSub2 && (
                  <div>
                    <label
                      htmlFor="problemTypeSub2"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      Specific Type <span className="text-text-secondary">(optional)</span>
                    </label>
                    <select
                      id="problemTypeSub2"
                      name="problemTypeSub2"
                      value={formData.problemTypeSub2}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent bg-bg-card"
                    >
                      <option value="">Select...</option>
                      {problemTypeSub2s.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Assignee Preview */}
                <AssigneePreview
                  assigneeEmail={suggestedAssignee?.email || null}
                  client={graphClient}
                  groupId={suggestedAssignee?.groupId}
                />
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
                          ? "border-brand-primary bg-brand-primary/10"
                          : "border-border hover:bg-bg-subtle"
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
                                  <p className="font-bold mb-1">Use Sparingly!</p>
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
                  Location <span className="text-red-500">*</span>
                </label>
                <select
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required
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
                  Where is the issue occurring? Select &quot;Park Wide&quot; or &quot;N/A&quot; if not location-specific.
                </p>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Attachments <span className="text-text-secondary font-normal">(optional)</span>
                </label>
                <AttachmentUpload
                  onUpload={handleStageFile}
                  disabled={submitting}
                />
                <StagedAttachmentList
                  files={stagedFiles}
                  onRemove={handleRemoveStagedFile}
                />
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
                    {submitting ? (submitStatus || "Submitting...") : (stagedFiles.length > 0 ? `Submit Ticket (${stagedFiles.length} file${stagedFiles.length !== 1 ? "s" : ""})` : "Submit Ticket")}
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
