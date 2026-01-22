"use client";

import { useState } from "react";
import { Attachment } from "@/types/ticket";

interface AttachmentListProps {
  attachments: Attachment[];
  onDelete?: (filename: string) => Promise<void>;
  onDownload?: (filename: string) => Promise<void>;
  canDelete?: boolean;
  loading?: boolean;
}

// Format file size in human-readable format
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Get icon based on file type
function getFileIcon(contentType: string, filename: string): JSX.Element {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  // Image files
  if (contentType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return (
      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }

  // PDF files
  if (contentType === "application/pdf" || ext === "pdf") {
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }

  // Document files
  if (["doc", "docx", "odt", "rtf"].includes(ext) || contentType.includes("word")) {
    return (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }

  // Spreadsheet files
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || contentType.includes("spreadsheet") || contentType.includes("excel")) {
    return (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    );
  }

  // Default file icon
  return (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function AttachmentList({
  attachments,
  onDelete,
  onDownload,
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
          {getFileIcon(attachment.contentType, attachment.name)}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {attachment.name}
            </p>
            <p className="text-xs text-text-secondary">
              {formatFileSize(attachment.size)}
            </p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
