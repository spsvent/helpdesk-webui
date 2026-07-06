"use client";

import { useState } from "react";
import { Attachment } from "@/types/ticket";
import { getFileIcon, formatFileSize } from "./fileTypeIcon";
import { isImageAttachment } from "@/lib/attachmentComments";
import AttachmentThumbnail from "./AttachmentThumbnail";

interface AttachmentListProps {
  attachments: Attachment[];
  onDelete?: (filename: string) => Promise<void>;
  onDownload?: (filename: string) => Promise<void>;
  /** Open the full-size lightbox for an image attachment. */
  onPreview?: (filename: string) => void;
  /** Downloads (once, cached by the parent) and returns an object URL — enables 40×40 image thumbs. */
  getPreviewUrl?: (name: string) => Promise<string | null>;
  canDelete?: boolean;
  loading?: boolean;
}

export default function AttachmentList({
  attachments,
  onDelete,
  onDownload,
  onPreview,
  getPreviewUrl,
  canDelete = false,
  loading = false,
}: AttachmentListProps) {
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const handleDelete = async (filename: string) => {
    if (!onDelete || !confirm(`Delete "${filename}"?`)) return;

    setDeletingFile(filename);
    try {
      await onDelete(filename);
    } finally {
      setDeletingFile(null);
    }
  };

  const handleDownload = async (filename: string) => {
    if (!onDownload) return;

    setDownloadingFile(filename);
    try {
      await onDownload(filename);
    } finally {
      setDownloadingFile(null);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-text-secondary flex items-center gap-2">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading attachments...
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-text-secondary italic">No attachments</p>
    );
  }

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <li
          key={attachment.name}
          className="flex items-center gap-2 p-2 bg-bg-subtle rounded-lg group"
        >
          {getPreviewUrl && isImageAttachment(attachment.name) ? (
            <AttachmentThumbnail
              attachment={attachment}
              getPreviewUrl={getPreviewUrl}
              onOpen={() => onPreview?.(attachment.name)}
              sizeClass="w-10 h-10"
            />
          ) : (
            getFileIcon(attachment.contentType, attachment.name)
          )}

          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-medium text-text-primary truncate">
              {attachment.name}
            </p>
            {attachment.size > 0 && (
              <p className="text-xs text-text-secondary">
                {formatFileSize(attachment.size)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Preview button (images only) */}
            {onPreview && isImageAttachment(attachment.name) && (
              <button
                onClick={() => onPreview(attachment.name)}
                className="p-1.5 text-text-secondary hover:text-brand-primary hover:bg-white rounded transition-colors"
                title="Preview"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}

            {/* Download button */}
            <button
              onClick={() => handleDownload(attachment.name)}
              disabled={downloadingFile === attachment.name}
              className="p-1.5 text-text-secondary hover:text-brand-primary hover:bg-white rounded transition-colors"
              title="Download"
            >
              {downloadingFile === attachment.name ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
            </button>

            {/* Delete button (if allowed) */}
            {canDelete && onDelete && (
              <button
                onClick={() => handleDelete(attachment.name)}
                disabled={deletingFile === attachment.name}
                className="p-1.5 text-text-secondary hover:text-red-600 hover:bg-white rounded transition-colors"
                title="Delete"
              >
                {deletingFile === attachment.name ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
