"use client";

import { useState, useEffect } from "react";
import { loadDraft, clearDraft } from "@/lib/formDraft";
import MarkdownEditor from "./MarkdownEditor";

interface CommentInputProps {
  onSubmit: (text: string, isInternal: boolean) => void;
  disabled?: boolean;
  ticketId?: string;
}

export default function CommentInput({ onSubmit, disabled, ticketId }: CommentInputProps) {
  const [text, setText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const draftKey = ticketId ? `comment:${ticketId}` : null;

  // Restore a comment draft snapshotted before a renewal redirect, then clear it (one-shot).
  useEffect(() => {
    if (!draftKey) return;
    const d = loadDraft<{ text: string; isInternal: boolean }>(draftKey);
    if (d) {
      setText(d.text);
      setIsInternal(d.isInternal);
      clearDraft(draftKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSubmit(text, isInternal);
      setText("");
      setIsInternal(false);
      if (draftKey) clearDraft(draftKey);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <MarkdownEditor
        value={text}
        onChange={setText}
        placeholder="Add a comment..."
        rows={3}
        disabled={disabled}
        ariaLabel="Add a comment"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            disabled={disabled}
            className="rounded border-border text-brand-blue focus:ring-brand-blue"
          />
          Internal note (hidden from requester - only managers &amp; assigned staff can see)
        </label>

        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="px-4 py-2 bg-brand-blue text-white rounded-lg font-medium hover:bg-brand-blue-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabled ? "Posting..." : "Post Comment"}
        </button>
      </div>
    </form>
  );
}
