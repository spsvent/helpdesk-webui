"use client";

import { Ticket, Comment, Attachment } from "@/types/ticket";
import UserAvatar from "./UserAvatar";
import AttachmentThumbnail from "./AttachmentThumbnail";
import {
  classifyAttachmentComment,
  matchAttachmentsInComment,
  isImageAttachment,
  type AttachmentCommentInfo,
} from "@/lib/attachmentComments";

interface ConversationThreadProps {
  ticket: Ticket;
  comments: Comment[];
  loading: boolean;
  /** Ticket attachments, used to enrich "[System] attachment uploaded" comments. */
  attachments?: Attachment[];
  getPreviewUrl?: (name: string) => Promise<string | null>;
  /** Open the full-size lightbox for an image attachment. */
  onOpenImage?: (name: string) => void;
  /** Scroll the details pane to the Attachments section. */
  onScrollToAttachments?: () => void;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

// Enrichment context threaded from TicketDetail so attachment comments can show
// thumbnails and jump-to-attachments links.
interface AttachmentEnrichment {
  attachments?: Attachment[];
  getPreviewUrl?: (name: string) => Promise<string | null>;
  onOpenImage?: (name: string) => void;
  onScrollToAttachments?: () => void;
}

// Renders the body of a recognized "[System]" attachment comment: a summary
// line, clickable image thumbnails (open the lightbox), and filename links that
// jump to the Attachments list in the details pane.
function AttachmentCommentBody({
  info,
  body,
  attachments = [],
  getPreviewUrl,
  onOpenImage,
  onScrollToAttachments,
}: { info: AttachmentCommentInfo; body: string } & AttachmentEnrichment) {
  if (info.kind === "failed") {
    return (
      <div className="flex items-start gap-2 text-sm text-amber-700">
        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>
          {info.count} of {info.total} attachment{info.total === 1 ? "" : "s"} failed to upload during ticket creation.
        </span>
      </div>
    );
  }

  const matched = matchAttachmentsInComment(body, attachments);
  const shownCount = matched.length || info.count;
  const label = `Uploaded ${shownCount} ${shownCount === 1 ? "attachment" : "attachments"}`;

  // Attachments referenced by the comment are gone (deleted) or not loaded yet —
  // show a plain summary with a link to the attachments section.
  if (matched.length === 0) {
    return (
      <div className="text-sm text-text-secondary">
        <span>{label}.</span>{" "}
        {onScrollToAttachments && (
          <button
            type="button"
            onClick={onScrollToAttachments}
            className="text-brand-primary hover:underline"
          >
            View attachments
          </button>
        )}
      </div>
    );
  }

  const images = matched.filter((a) => isImageAttachment(a.name));

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary flex items-center gap-1.5">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {label}
      </p>

      {/* Clickable thumbnails for image attachments */}
      {getPreviewUrl && onOpenImage && images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <AttachmentThumbnail
              key={a.name}
              attachment={a}
              getPreviewUrl={getPreviewUrl}
              onOpen={() => onOpenImage(a.name)}
            />
          ))}
        </div>
      )}

      {/* Filename links → jump to the Attachments list */}
      <ul className="flex flex-col gap-1">
        {matched.map((a) => (
          <li key={a.name} className="min-w-0">
            <button
              type="button"
              onClick={onScrollToAttachments}
              className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline max-w-full"
              title="Jump to this file in the Attachments list"
              aria-label={`Jump to ${a.name} in the attachments list`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="truncate">{a.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentCard({
  author,
  content,
  timestamp,
  isDescription = false,
  descriptionLabel = "Description",
  isInternal = false,
  commentType,
  enrichment,
}: {
  author: { displayName: string; email: string };
  content: string;
  timestamp: string;
  isDescription?: boolean;
  descriptionLabel?: string;
  isInternal?: boolean;
  commentType?: string;
  enrichment?: AttachmentEnrichment;
}) {
  const cardClass = isDescription
    ? "comment-card comment-card-description"
    : isInternal
    ? "comment-card comment-card-internal"
    : "comment-card";

  // Recognize "[System]" attachment comments and render them richly.
  const attachmentInfo = !isDescription ? classifyAttachmentComment(content) : null;

  return (
    <div className={cardClass}>
      <div className="flex gap-3">
        <UserAvatar name={author.displayName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-text-primary">
              {author.displayName}
            </span>
            <span className="text-xs text-text-secondary">
              {formatTimestamp(timestamp)}
            </span>
            {isDescription && (
              <span className="badge bg-brand-primary/15 text-brand-primary">
                {descriptionLabel}
              </span>
            )}
            {isInternal && (
              <span className="badge bg-yellow-100 text-yellow-800">
                Internal
              </span>
            )}
            {commentType && commentType !== "Comment" && !isDescription && (
              <span className="badge bg-gray-100 text-gray-800">
                {commentType}
              </span>
            )}
          </div>
          {attachmentInfo ? (
            <AttachmentCommentBody info={attachmentInfo} body={content} {...enrichment} />
          ) : (
            <div
              className="text-text-primary prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationThread({
  ticket,
  comments,
  loading,
  attachments,
  getPreviewUrl,
  onOpenImage,
  onScrollToAttachments,
}: ConversationThreadProps) {
  const enrichment: AttachmentEnrichment = {
    attachments,
    getPreviewUrl,
    onOpenImage,
    onScrollToAttachments,
  };
  // For migrated tickets, use originalRequester if available
  const descriptionAuthor = ticket.originalRequester
    ? { displayName: ticket.originalRequester.split('<')[0].trim() || ticket.originalRequester, email: '' }
    : ticket.requester;

  // Check if first comment is the "initial submission" from SharePoint App (Plumsail behavior)
  // If description is empty, use that comment as the description
  const firstComment = comments[0];
  const isFirstCommentInitialSubmission = firstComment && !ticket.description && (
    firstComment.originalAuthor === "SharePoint App" ||
    firstComment.createdBy.displayName === "SharePoint App"
  );

  // Use first comment as description if it's the initial submission
  const effectiveDescription = isFirstCommentInitialSubmission
    ? firstComment.commentBody
    : ticket.description;

  // Filter out the first comment if we're using it as description
  const displayComments = isFirstCommentInitialSubmission
    ? comments.slice(1)
    : comments;

  // For purchase requests with an empty description, the user filled out a
  // Justification instead — show that in the description slot. Otherwise fall
  // back to the description (which may itself be empty → "No description provided").
  const hasDescriptionText = effectiveDescription && effectiveDescription.trim().length > 0;
  const usePurchaseJustification =
    !hasDescriptionText && ticket.isPurchaseRequest && ticket.purchaseJustification?.trim();
  const slotContent = usePurchaseJustification
    ? ticket.purchaseJustification!
    : effectiveDescription || "<em>No description provided</em>";
  const slotLabel = usePurchaseJustification ? "Justification" : "Description";

  return (
    <div className="space-y-4">
      {/* Description (or Justification for purchase requests) as first "comment" */}
      <CommentCard
        author={descriptionAuthor}
        content={slotContent}
        timestamp={ticket.created}
        isDescription={true}
        descriptionLabel={slotLabel}
      />

      {/* Loading state */}
      {loading && (
        <div className="text-center py-4 text-text-secondary">
          Loading comments...
        </div>
      )}

      {/* Comments */}
      {!loading && displayComments.length === 0 && (
        <div className="text-center py-4 text-text-secondary">
          No comments yet. Be the first to add one.
        </div>
      )}

      {displayComments.map((comment) => {
        // For migrated comments, use original author/date if available
        const author = comment.originalAuthor
          ? { displayName: comment.originalAuthor.split('<')[0].trim(), email: '' }
          : comment.createdBy;
        const timestamp = comment.originalCreated || comment.created;

        return (
          <CommentCard
            key={comment.id}
            author={author}
            content={comment.commentBody}
            timestamp={timestamp}
            isInternal={comment.isInternal}
            commentType={comment.commentType}
            enrichment={enrichment}
          />
        );
      })}
    </div>
  );
}
