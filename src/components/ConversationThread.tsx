"use client";

import { Ticket, Comment } from "@/types/ticket";
import UserAvatar from "./UserAvatar";

interface ConversationThreadProps {
  ticket: Ticket;
  comments: Comment[];
  loading: boolean;
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

function CommentCard({
  author,
  content,
  timestamp,
  isDescription = false,
  isInternal = false,
  commentType,
}: {
  author: { displayName: string; email: string };
  content: string;
  timestamp: string;
  isDescription?: boolean;
  isInternal?: boolean;
  commentType?: string;
}) {
  const cardClass = isDescription
    ? "comment-card comment-card-description"
    : isInternal
    ? "comment-card comment-card-internal"
    : "comment-card";

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
              <span className="badge bg-blue-100 text-blue-800">
                Description
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
          <div
            className="text-text-primary prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ConversationThread({
  ticket,
  comments,
  loading,
}: ConversationThreadProps) {
  return (
    <div className="space-y-4">
      {/* Description as first "comment" */}
      <CommentCard
        author={ticket.requester}
        content={ticket.description || "<em>No description provided</em>"}
        timestamp={ticket.created}
        isDescription={true}
      />

      {/* Loading state */}
      {loading && (
        <div className="text-center py-4 text-text-secondary">
          Loading comments...
        </div>
      )}

      {/* Comments */}
      {!loading && comments.length === 0 && (
        <div className="text-center py-4 text-text-secondary">
          No comments yet. Be the first to add one.
        </div>
      )}

      {comments.map((comment) => {
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
          />
        );
      })}
    </div>
  );
}
