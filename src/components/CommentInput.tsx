"use client";

import { useState } from "react";

interface CommentInputProps {
  onSubmit: (text: string, isInternal: boolean) => void;
  disabled?: boolean;
}

export default function CommentInput({ onSubmit, disabled }: CommentInputProps) {
  const [text, setText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSubmit(text, isInternal);
      setText("");
      setIsInternal(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment..."
        rows={3}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
          Internal note (only visible to staff)
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
