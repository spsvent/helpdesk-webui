"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { Ticket, Comment, Attachment } from "@/types/ticket";
import { isImageAttachment, isBrowserPreviewable } from "@/lib/attachmentComments";
import { buildRenditionView, isHeic, renditionName } from "@/lib/heicRenditions";
import { convertHeicToJpeg, isConvertibleSize, isHeicConvertEnabled } from "@/lib/heicConvertService";
import {
  getGraphClient,
  getComments,
  addComment,
  getTicket,
  requestApproval,
  processApprovalDecision,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  logActivity,
  triggerApprovalRequestEmail,
} from "@/lib/graphClient";
import {
  sendDecisionEmail,
  sendCommentEmail,
} from "@/lib/emailService";
import { useRBAC } from "@/contexts/RBACContext";
import { sendNewTicketTeamsNotification } from "@/lib/teamsService";
import { syncCommentAdded } from "@/lib/vikunjaSyncService";
import ConversationThread from "./ConversationThread";
import DetailsPanel from "./DetailsPanel";
import ImageLightbox from "./ImageLightbox";
import CommentInput from "./CommentInput";
import ApprovalStatusBadge from "./ApprovalStatusBadge";
import NudgeApprovalButton from "./NudgeApprovalButton";
import ApprovalActionPanel from "./ApprovalActionPanel";
import { collectParticipants, staffSubset } from "@/lib/participants";
import { getStaffEmails } from "@/lib/rbacService";
import { ensureFreshToken } from "@/lib/authActions";
import { saveDraft } from "@/lib/formDraft";
import { graphScopes } from "@/lib/msalConfig";

interface TicketDetailProps {
  ticket: Ticket;
  onUpdate: (ticket: Ticket) => void;
}

function getStatusBadgeClass(status: Ticket["status"]): string {
  const classes: Record<Ticket["status"], string> = {
    "New": "bg-brand-primary",
    "In Progress": "bg-brand-green",
    "On Hold": "bg-brand-yellow",
    "Resolved": "bg-emerald-500",
    "Closed": "bg-slate-500",
  };
  return `${classes[status] || "bg-brand-primary"} text-white`;
}

function getPriorityClass(priority: Ticket["priority"]): string {
  const classes: Record<Ticket["priority"], string> = {
    "Low": "text-text-secondary",
    "Normal": "text-brand-primary",
    "High": "text-orange-600 font-semibold",
    "Urgent": "text-brand-red font-bold",
  };
  return classes[priority] || "text-brand-primary";
}

type MobileDetailView = "comments" | "details";

export default function TicketDetail({ ticket, onUpdate }: TicketDetailProps) {
  const { instance, accounts } = useMsal();
  const { canEdit, canComment, isOwn, canApprove, permissions } = useRBAC();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Mobile view state
  const [mobileDetailView, setMobileDetailView] = useState<MobileDetailView>("comments");
  const [isMobile, setIsMobile] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Image preview (thumbnails + lightbox) state.
  // SharePoint list attachments have no thumbnail endpoint, so previews download
  // the full file once and cache the object URL, shared by thumbnails + lightbox.
  const previewCache = useRef<Map<string, string>>(new Map());
  const previewInflight = useRef<Map<string, Promise<string | null>>>(new Map());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [highlightAttachments, setHighlightAttachments] = useState(false);
  // Name of the single attachment row to highlight after a "jump to file" link
  // (null → highlight the whole section instead).
  const [highlightedAttachment, setHighlightedAttachment] = useState<string | null>(null);
  const attachmentsSectionRef = useRef<HTMLDivElement>(null);
  // Deferred mobile scroll: holds the target of a scroll requested while the
  // Details tab wasn't mounted yet ({} → the section, { name } → that file's row).
  const pendingScrollRef = useRef<{ name?: string } | null>(null);
  // Highlight-clearing timer — kept in a ref so a second jump restarts the
  // window instead of a stale timeout cutting the new highlight short.
  const highlightTimeoutRef = useRef<number | null>(null);

  const heicConvertEnabled = isHeicConvertEnabled();

  // Hide generated HEIC→JPEG renditions from the list and map each back to its
  // HEIC original so previews can use the rendition as the image source.
  const { visible: displayAttachments, renditionByOriginal } = useMemo(
    () => buildRenditionView(attachments),
    [attachments]
  );

  // Read the latest rendition map + ticket id from refs inside otherwise-stable
  // callbacks: adding a rendition rebuilds the map, but we don't want that to
  // churn getPreviewUrl/canThumbnail identities and re-run child effects; and
  // in-flight async work needs to tell whether the user has since switched tickets.
  const renditionRef = useRef(renditionByOriginal);
  renditionRef.current = renditionByOriginal;
  const ticketIdRef = useRef(ticket.id);
  ticketIdRef.current = ticket.id;

  // Attachment sizes by name, so the HEIC-conversion paths can skip files the
  // converter would reject (over its size cap) without downloading them first.
  const attachmentSizes = useMemo(
    () => new Map(attachments.map((a) => [a.name, a.size])),
    [attachments]
  );
  const attachmentSizeRef = useRef(attachmentSizes);
  attachmentSizeRef.current = attachmentSizes;

  const imageAttachments = useMemo(
    () => displayAttachments.filter((a) => isImageAttachment(a.name)),
    [displayAttachments]
  );

  // Can a thumbnail render inline without triggering a (potentially slow)
  // conversion? Natively-previewable formats, or a HEIC that already has a
  // rendition. HEIC without a rendition stays an icon until opened in the lightbox.
  const canThumbnail = useCallback(
    (name: string) =>
      isBrowserPreviewable(name) || (isHeic(name) && renditionRef.current.has(name)),
    []
  );

  // Can the lightbox show this inline (converting a HEIC on demand if needed)?
  // Oversized HEICs (beyond the converter's cap) get the download fallback.
  const canPreview = useCallback(
    (name: string) =>
      isBrowserPreviewable(name) ||
      (isHeic(name) &&
        (renditionRef.current.has(name) ||
          (heicConvertEnabled && isConvertibleSize(attachmentSizeRef.current.get(name))))),
    [heicConvertEnabled]
  );

  // Resolve an attachment name to a displayable image blob, converting HEIC via
  // the backend (and persisting the rendition) the first time it's needed.
  const fetchPreviewBlob = useCallback(
    async (name: string): Promise<Blob | null> => {
      if (!accounts[0]) return null;
      const client = getGraphClient(instance, accounts[0]);
      const tid = ticket.id;

      if (!isHeic(name)) {
        return downloadAttachment(client, tid, name, instance, accounts[0]);
      }

      // HEIC: prefer an existing rendition; otherwise convert on demand.
      const existing = renditionRef.current.get(name);
      if (existing) {
        return downloadAttachment(client, tid, existing.name, instance, accounts[0]);
      }
      if (!heicConvertEnabled) return null;
      // The converter caps its input size — skip the download + round trip for
      // oversized files so they fall back to the download-only path immediately.
      if (!isConvertibleSize(attachmentSizeRef.current.get(name))) return null;

      const heicBlob = await downloadAttachment(client, tid, name, instance, accounts[0]);
      if (!heicBlob) return null;
      const jpeg = await convertHeicToJpeg(heicBlob);
      if (!jpeg) return null;

      // Persist the rendition so future previews (and thumbnails) skip conversion.
      // Only fold it into state if we're still on the ticket it belongs to.
      const rn = renditionName(name);
      const file = new File([jpeg], rn, { type: "image/jpeg" });
      uploadAttachment(client, tid, file, instance, accounts[0])
        .then((att) => {
          if (att && ticketIdRef.current === tid) {
            setAttachments((prev) => (prev.some((p) => p.name === att.name) ? prev : [...prev, att]));
          }
        })
        .catch((e) => console.error("Failed to store HEIC rendition:", e));

      return jpeg;
    },
    [instance, accounts, ticket.id, heicConvertEnabled]
  );

  // Download (once, cached) a preview and return an object URL, keyed by the
  // original attachment name so callers don't need to know about renditions.
  const getPreviewUrl = useCallback(
    async (name: string): Promise<string | null> => {
      const cached = previewCache.current.get(name);
      if (cached) return cached;
      const inflight = previewInflight.current.get(name);
      if (inflight) return inflight;
      if (!accounts[0]) return null;

      const tid = ticket.id;
      // `let` + self-reference: the finally block runs only after the async
      // body has awaited at least once, so `promise` is assigned by then.
      let promise: Promise<string | null> | undefined;
      promise = (async () => {
        try {
          const blob = await fetchPreviewBlob(name);
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          // The cache/inflight maps are keyed by name only and outlive ticket
          // switches (the cleanup effect below revokes+clears them per ticket).
          // If the user switched tickets while this download was in flight,
          // caching now would poison the NEW ticket's cache with this ticket's
          // bytes — and leak an object URL nobody would revoke. Drop it instead.
          if (ticketIdRef.current !== tid) {
            URL.revokeObjectURL(url);
            return null;
          }
          previewCache.current.set(name, url);
          return url;
        } catch (e) {
          console.error("Failed to load attachment preview:", e);
          return null;
        } finally {
          // Only remove our own entry: after a ticket switch clears the map,
          // the new ticket may have an in-flight download under the same name.
          if (previewInflight.current.get(name) === promise) {
            previewInflight.current.delete(name);
          }
        }
      })();
      previewInflight.current.set(name, promise);
      return promise;
    },
    [accounts, fetchPreviewBlob, ticket.id]
  );

  // Synchronous cache peek so the lightbox can show an already-fetched image
  // on its very first frame (no spinner flash when paging back to it).
  const peekPreviewUrl = useCallback(
    (name: string): string | null => previewCache.current.get(name) ?? null,
    []
  );

  // Revoke cached object URLs and close the lightbox when the ticket changes.
  useEffect(() => {
    const cache = previewCache.current;
    const inflight = previewInflight.current;
    setLightboxIndex(null);
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
      inflight.clear();
    };
  }, [ticket.id]);

  const openLightbox = useCallback(
    (name: string) => {
      const idx = imageAttachments.findIndex((a) => a.name === name);
      if (idx >= 0) setLightboxIndex(idx);
    },
    [imageAttachments]
  );

  // Scroll to the Attachments section — or, when a filename is given and its
  // row is rendered, to that specific row (with a row-level highlight). Falls
  // back to the section-level highlight when the name isn't in the list.
  const doScrollToAttachments = useCallback((name?: string) => {
    const section = attachmentsSectionRef.current;
    if (!section) return;
    const row = name
      ? section.querySelector<HTMLElement>(`[data-attachment-name="${CSS.escape(name)}"]`)
      : null;
    (row ?? section).scrollIntoView({ behavior: "smooth", block: row ? "center" : "start" });
    setHighlightAttachments(!row);
    setHighlightedAttachment(row && name ? name : null);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightAttachments(false);
      setHighlightedAttachment(null);
      highlightTimeoutRef.current = null;
    }, 1600);
  }, []);

  const scrollToAttachments = useCallback(
    (name?: string) => {
      // On mobile the Attachments live in the "Details" tab — switch to it first,
      // then scroll once the panel has mounted (handled by the effect below).
      if (isMobile && mobileDetailView !== "details") {
        pendingScrollRef.current = { name };
        setMobileDetailView("details");
        return;
      }
      doScrollToAttachments(name);
    },
    [isMobile, mobileDetailView, doScrollToAttachments]
  );

  // Perform a deferred scroll after the mobile Details panel becomes visible.
  useEffect(() => {
    if (mobileDetailView === "details" && pendingScrollRef.current) {
      const { name } = pendingScrollRef.current;
      pendingScrollRef.current = null;
      const id = window.setTimeout(() => doScrollToAttachments(name), 60);
      return () => window.clearTimeout(id);
    }
  }, [mobileDetailView, doScrollToAttachments]);

  const handleCopyTicketLink = async () => {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const url = `${base}?ticket=${ticket.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  // Right sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(320); // 320px = w-80 default
  const isResizing = useRef(false);
  const MIN_SIDEBAR_WIDTH = 240;
  const MAX_SIDEBAR_WIDTH = 500;

  // Ref to access DetailsPanel save function
  const detailsPanelSaveRef = useRef<{ save: () => Promise<void>; hasChanges: boolean } | null>(null);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle sidebar resize
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Calculate from right edge
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const canEditThisTicket = canEdit(ticket);
  const canCommentOnThisTicket = canComment(ticket);
  const isOwnTicket = isOwn(ticket);

  // Fetch comments when ticket changes
  useEffect(() => {
    const fetchComments = async () => {
      if (!accounts[0]) return;

      setLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const ticketComments = await getComments(client, parseInt(ticket.id));
        setComments(ticketComments);
      } catch (e) {
        console.error("Failed to fetch comments:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [ticket.id, accounts, instance]);

  // Re-fetch the ticket itself when a new ticket is selected. Guards
  // against showing days-old React state when a user opens a ticket
  // they previously had loaded. The cancelled flag prevents a slow
  // fetch from clobbering state if the user clicks a different ticket
  // before this one resolves.
  useEffect(() => {
    if (!accounts[0]) return;
    let cancelled = false;
    const ticketIdAtFetch = ticket.id;

    (async () => {
      try {
        const client = getGraphClient(instance, accounts[0]);
        const fresh = await getTicket(client, ticketIdAtFetch);
        if (!cancelled) onUpdate(fresh);
      } catch (e) {
        if (!cancelled) console.error("Failed to refresh ticket on open:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally depend only on ticket.id — onUpdate identity changes
    // would re-trigger the fetch unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, accounts, instance]);

  // Fetch attachments when ticket changes. The cancelled flag prevents a slow
  // fetch from landing another ticket's attachment list (or clobbering the new
  // ticket's loading state) if the user switches tickets before it resolves.
  useEffect(() => {
    let cancelled = false;

    const fetchAttachments = async () => {
      if (!accounts[0]) return;

      setAttachmentsLoading(true);
      try {
        const client = getGraphClient(instance, accounts[0]);
        const ticketAttachments = await getAttachments(client, ticket.id, instance, accounts[0]);
        if (!cancelled) setAttachments(ticketAttachments);
      } catch (e) {
        if (!cancelled) console.error("Failed to fetch attachments:", e);
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    };

    fetchAttachments();

    return () => {
      cancelled = true;
    };
  }, [ticket.id, accounts, instance]);

  // Handle adding a new comment
  const handleAddComment = async (text: string, isInternal: boolean) => {
    if (!accounts[0] || !text.trim()) return;

    setSubmitting(true);
    const commenterEmail = accounts[0].username;
    const commenterName = accounts[0].name || accounts[0].username;

    try {
      // Save any pending details changes first
      if (detailsPanelSaveRef.current?.hasChanges) {
        await detailsPanelSaveRef.current.save();
      }

      // Pre-flight: snapshot the comment so a renewal redirect (rare) doesn't lose it.
      const tokenOk = await ensureFreshToken(instance, accounts[0], graphScopes, {
        onBeforeRedirect: () => saveDraft(`comment:${ticket.id}`, { text, isInternal }),
      });
      if (!tokenOk) { setSubmitting(false); return; }

      const client = getGraphClient(instance, accounts[0]);
      const newComment = await addComment(
        client,
        parseInt(ticket.id),
        text,
        isInternal
      );
      setComments((prev) => [...prev, newComment]);

      // Log the comment activity
      logActivity(client, {
        eventType: "comment_added",
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
        actor: commenterEmail,
        actorName: commenterName,
        description: `${isInternal ? "Internal note" : "Comment"} added by ${commenterName}`,
        details: JSON.stringify({
          isInternal,
          commentId: newComment.id,
          textPreview: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        }),
      }).catch((e) => console.error("Failed to log comment activity:", e));

      // Notify participants. Public comments -> everyone; internal notes -> staff only.
      try {
        const participants = collectParticipants(
          {
            requesterEmail: ticket.requester.email,
            assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
            approverEmail: ticket.approvedBy?.email,
            approvalRequesterEmail: ticket.approvalRequestedBy?.email,
            manualEmails: ticket.participantEmails,
            commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
          },
          commenterEmail
        );

        let recipients = participants;
        if (isInternal) {
          const staffEmails = await getStaffEmails(client);
          recipients = staffSubset(participants, staffEmails);
        }

        const requesterEmailLc = ticket.requester.email?.toLowerCase();
        await Promise.all(
          recipients.map((email) =>
            sendCommentEmail(client, ticket, email, commenterName, text, email === requesterEmailLc).catch((e) =>
              console.error(`Failed to send comment email to ${email}:`, e)
            )
          )
        );
      } catch (e) {
        console.error("Failed to send comment notifications:", e);
      }

      // Sync comment to Vikunja (fire-and-forget, Tech tickets only)
      syncCommentAdded(ticket, text, isInternal, commenterName, commenterEmail);
    } catch (e) {
      console.error("Failed to add comment:", e);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle uploading an attachment
  const handleUploadAttachment = async (file: File): Promise<boolean> => {
    if (!accounts[0]) return false;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const attachment = await uploadAttachment(client, ticket.id, file, instance, accounts[0]);
      if (attachment) {
        setAttachments((prev) => [...prev, attachment]);

        // Add system comment noting the attachment upload
        const sizeStr = attachment.size > 0
          ? ` (${attachment.size < 1024 ? attachment.size + " B" : attachment.size < 1048576 ? (attachment.size / 1024).toFixed(1) + " KB" : (attachment.size / 1048576).toFixed(1) + " MB"})`
          : "";
        const commentText = `[System] Attachment uploaded: ${attachment.name}${sizeStr} — available in the Attachments section above.`;
        const newComment = await addComment(client, parseInt(ticket.id), commentText, true);
        setComments((prev) => [...prev, newComment]);

        // Log the upload activity
        logActivity(client, {
          eventType: "comment_added",
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
          actor: accounts[0].username,
          actorName: accounts[0].name || accounts[0].username,
          description: `Attachment uploaded: ${attachment.name}`,
        }).catch((e) => console.error("Failed to log attachment upload:", e));

        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to upload attachment:", e);
      return false;
    }
  };

  // Handle deleting an attachment
  const handleDeleteAttachment = async (filename: string): Promise<void> => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const tid = ticket.id;
      const success = await deleteAttachment(client, tid, filename, instance, accounts[0]);
      if (success) {
        setAttachments((prev) => prev.filter((a) => a.name !== filename));
        // Also remove any generated HEIC→JPEG rendition so it isn't orphaned.
        const rendition = renditionRef.current.get(filename);
        if (rendition) {
          deleteAttachment(client, tid, rendition.name, instance, accounts[0])
            .then((ok) => {
              if (ok && ticketIdRef.current === tid) {
                setAttachments((prev) => prev.filter((a) => a.name !== rendition.name));
              }
            })
            .catch((e) => console.error("Failed to delete HEIC rendition:", e));
        }
      }
    } catch (e) {
      console.error("Failed to delete attachment:", e);
    }
  };

  // Handle downloading an attachment
  const handleDownloadAttachment = async (filename: string): Promise<void> => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const blob = await downloadAttachment(client, ticket.id, filename, instance, accounts[0]);
      if (blob) {
        // Create a download link and trigger it
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Failed to download attachment:", e);
    }
  };

  // Handle merge complete - re-fetch ticket and comments
  const handleMergeComplete = async () => {
    if (!accounts[0]) return;

    try {
      const client = getGraphClient(instance, accounts[0]);
      const updatedTicket = await getTicket(client, ticket.id);
      onUpdate(updatedTicket);
      const ticketComments = await getComments(client, parseInt(ticket.id));
      setComments(ticketComments);
    } catch (e) {
      console.error("Failed to refresh after merge:", e);
    }
  };

  // Handle requesting approval
  const handleRequestApproval = async () => {
    if (!accounts[0]) return;

    const client = getGraphClient(instance, accounts[0]);
    const requesterName = accounts[0].name || accounts[0].username;
    const requesterEmail = accounts[0].username;

    // Update ticket status to Pending
    const updatedTicket = await requestApproval(client, ticket.id, requesterName, requesterEmail);
    onUpdate(updatedTicket);

    // Log approval request
    logActivity(client, {
      eventType: "approval_requested",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: requesterEmail,
      actorName: requesterName,
      description: `Approval requested by ${requesterName}`,
      details: JSON.stringify({
        ticketTitle: ticket.title,
        ticketStatus: updatedTicket.status,
      }),
    }).catch((e) => console.error("Failed to log approval request:", e));

    // Build + send the signed approval-request email server-side (links carry HMAC tokens)
    triggerApprovalRequestEmail(ticket.id, requesterName)
      .catch((e) => console.error("Failed to trigger approval request email:", e));

    // Add internal note about approval request
    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      `Approval requested by ${requesterName}`,
      true
    );
    setComments((prev) => [...prev, approvalComment]);
  };

  // Handle approval decision
  const handleApprovalDecision = async (
    decision: "Approved" | "Denied" | "Changes Requested",
    notes?: string,
  ) => {
    if (!accounts[0]) return;

    // Pre-flight: snapshot the decision so a renewal redirect doesn't lose it.
    const tokenOk = await ensureFreshToken(instance, accounts[0], graphScopes, {
      onBeforeRedirect: () => saveDraft(`approval:${ticket.id}`, { decision, notes }),
    });
    if (!tokenOk) return;

    const client = getGraphClient(instance, accounts[0]);
    const approverName = accounts[0].name || accounts[0].username;
    const approverEmail = accounts[0].username;

    // Process the approval decision — throws if the status didn't save
    const updatedTicket = await processApprovalDecision(
      client,
      ticket.id,
      decision,
      approverName,
      approverEmail,
      notes,
    );
    onUpdate(updatedTicket);

    // Only log, comment, and notify AFTER the status has been verified saved
    logActivity(client, {
      eventType: decision === "Approved" ? "approval_approved" : "approval_rejected",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber?.toString() || ticket.id,
      actor: approverEmail,
      actorName: approverName,
      description: `Ticket ${decision.toLowerCase()} by ${approverName}`,
      details: JSON.stringify({
        decision,
        notes: notes || null,
        requestedBy: ticket.approvalRequestedBy?.displayName || null,
      }),
    }).catch((e) => console.error("Failed to log approval decision:", e));

    const noteText = notes
      ? `**${decision}** by ${approverName}\n\nNotes: ${notes}`
      : `**${decision}** by ${approverName}`;

    const approvalComment = await addComment(
      client,
      parseInt(ticket.id),
      noteText,
      true
    );
    setComments((prev) => [...prev, approvalComment]);

    // Notify approval requester + ticket requester + assignee (deduped, excluding the approver)
    const decisionRecipients = new Set<string>();
    const approvalRequesterEmail = updatedTicket.approvalRequestedBy?.email || ticket.approvalRequestedBy?.email;
    if (approvalRequesterEmail) decisionRecipients.add(approvalRequesterEmail.toLowerCase());
    if (ticket.requester?.email) decisionRecipients.add(ticket.requester.email.toLowerCase());
    if (ticket.assignedTo?.email) decisionRecipients.add(ticket.assignedTo.email.toLowerCase());
    decisionRecipients.delete(approverEmail.toLowerCase()); // Don't notify the person who made the decision

    // Also notify participants of the decision
    collectParticipants(
      {
        requesterEmail: ticket.requester.email,
        assigneeEmail: ticket.originalAssignedTo || ticket.assignedTo?.email,
        approverEmail: ticket.approvedBy?.email,
        approvalRequesterEmail: updatedTicket.approvalRequestedBy?.email || ticket.approvalRequestedBy?.email,
        manualEmails: ticket.participantEmails,
        commenterEmails: comments.filter((c) => !c.isInternal).map((c) => c.createdBy.email),
      },
      approverEmail
    ).forEach((email) => decisionRecipients.add(email));

    const emailPromises = Array.from(decisionRecipients).map((email) =>
      sendDecisionEmail(client, updatedTicket, decision, approverName, email, notes)
        .catch((e) => console.error(`Failed to send decision email to ${email}:`, e))
    );
    await Promise.all(emailPromises);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Ticket header */}
      <div className="bg-bg-card border-b border-border px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                ticket.category === "Problem"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-sky-100 text-sky-700"
              }`}>
                {ticket.category}
              </span>
              {ticket.location && (
                <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-600">
                  {ticket.location}
                </span>
              )}
              <h1 className="text-lg md:text-xl font-semibold text-text-primary truncate max-w-full">
                {ticket.title}
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getStatusBadgeClass(
                  ticket.status
                )}`}
              >
                {ticket.status}
              </span>
              <ApprovalStatusBadge status={ticket.approvalStatus} size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-text-secondary">
              <span>#{ticket.id}</span>
              <span className="hidden sm:inline">
                {ticket.problemType}
                {ticket.problemTypeSub && ` / ${ticket.problemTypeSub}`}
                {ticket.problemTypeSub2 && ` / ${ticket.problemTypeSub2}`}
              </span>
              <span className="sm:hidden">{ticket.problemType}</span>
              <span className={getPriorityClass(ticket.priority)}>
                {ticket.priority.toUpperCase()}
              </span>
              {isOwnTicket && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded whitespace-nowrap">
                  Your ticket
                </span>
              )}
              {!canEditThisTicket && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded whitespace-nowrap">
                  Read only
                </span>
              )}
            </div>
            {/* Nudge button for keyword-matched users viewing pending requests */}
            {permissions.visibilityKeywordMatch &&
              ticket.category === "Request" &&
              ticket.approvalStatus === "Pending" && (
                <div className="mt-2">
                  <NudgeApprovalButton ticket={ticket} />
                </div>
              )}
          </div>
          <button
            type="button"
            onClick={handleCopyTicketLink}
            title="Copy a direct link to this ticket"
            className={`shrink-0 ml-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              linkCopied
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-bg-card text-text-secondary border-border hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {linkCopied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy Link
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile panel toggle */}
      {isMobile && (
        <div className="flex border-b border-border bg-bg-card">
          <button
            onClick={() => setMobileDetailView("comments")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              mobileDetailView === "comments"
                ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Comments
          </button>
          <button
            onClick={() => setMobileDetailView("details")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              mobileDetailView === "details"
                ? "text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Details
          </button>
        </div>
      )}

      {/* Main content area - conversation + details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation panel - hide on mobile when viewing details */}
        {(!isMobile || mobileDetailView === "comments") && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Scrollable conversation thread */}
            <div className="flex-1 overflow-y-auto p-6 scroll-container">
              {/* Approval action banner — shown above conversation when approval is pending */}
              {ticket.approvalStatus === "Pending" && canApprove() && (
                <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                  <ApprovalActionPanel
                    ticket={ticket}
                    onDecision={handleApprovalDecision}
                  />
                </div>
              )}

              <ConversationThread
                ticket={ticket}
                comments={comments}
                loading={loading}
                attachments={displayAttachments}
                getPreviewUrl={getPreviewUrl}
                canThumbnail={canThumbnail}
                onOpenImage={openLightbox}
                onScrollToAttachments={scrollToAttachments}
              />
            </div>

            {/* Comment input at bottom */}
            {canCommentOnThisTicket ? (
              <div className="border-t border-border bg-bg-card p-4">
                <CommentInput
                  onSubmit={handleAddComment}
                  disabled={submitting}
                  ticketId={ticket.id}
                />
              </div>
            ) : (
              <div className="border-t border-border bg-gray-50 p-4 text-center text-sm text-text-secondary">
                You don&apos;t have permission to add comments to this ticket.
              </div>
            )}
          </div>
        )}

        {/* Resize handle - desktop only */}
        {!isMobile && (
          <div
            onMouseDown={startResizing}
            className="w-1 cursor-col-resize hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors shrink-0"
            title="Drag to resize"
          />
        )}

        {/* Details sidebar - on mobile, show full width when selected */}
        {(!isMobile || mobileDetailView === "details") && (
          <aside
            className={`border-l border-border bg-bg-card overflow-y-auto scroll-container shrink-0 ${
              isMobile ? "flex-1 border-l-0" : ""
            }`}
            style={isMobile ? undefined : { width: sidebarWidth }}
          >
            <DetailsPanel
              ticket={ticket}
              comments={comments}
              onUpdate={onUpdate}
              canEdit={canEditThisTicket}
              onRequestApproval={handleRequestApproval}
              attachments={displayAttachments}
              attachmentsLoading={attachmentsLoading}
              onUploadAttachment={handleUploadAttachment}
              onDeleteAttachment={handleDeleteAttachment}
              onDownloadAttachment={handleDownloadAttachment}
              onPreviewImage={openLightbox}
              getAttachmentPreviewUrl={getPreviewUrl}
              attachmentsSectionRef={attachmentsSectionRef}
              highlightAttachments={highlightAttachments}
              highlightAttachmentName={highlightedAttachment}
              onMergeComplete={handleMergeComplete}
              saveRef={detailsPanelSaveRef}
            />
          </aside>
        )}
      </div>

      {/* Full-size image preview lightbox (paged across all image attachments) */}
      {lightboxIndex !== null && imageAttachments[lightboxIndex] && (
        <ImageLightbox
          images={imageAttachments}
          index={lightboxIndex}
          getPreviewUrl={getPreviewUrl}
          peekPreviewUrl={peekPreviewUrl}
          canPreview={canPreview}
          canPreloadNeighbor={canThumbnail}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDownload={handleDownloadAttachment}
        />
      )}
    </div>
  );
}
