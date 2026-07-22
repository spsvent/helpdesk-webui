"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderRichText } from "@/lib/richText";
import { htmlToMarkdown } from "@/lib/htmlToMarkdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  id?: string;
  name?: string;
  /** Accessible label for the textarea (falls back to the placeholder). */
  ariaLabel?: string;
}

// A pending selection to restore after a toolbar edit re-renders the (controlled)
// textarea. Only set by toolbar actions — plain typing leaves it null.
interface PendingSelection {
  start: number;
  end: number;
}

function ToolbarButton({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      className="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-text-secondary hover:bg-bg-card hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px self-center bg-border" aria-hidden="true" />;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  id,
  name,
  ariaLabel,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<PendingSelection | null>(null);

  // Formatting controls act on the textarea, which only exists in write mode, so
  // they're inert (and should look it) while previewing or when the whole editor
  // is disabled.
  const controlsDisabled = disabled || mode === "preview";

  // Re-apply the caret/selection after a toolbar edit updates `value`.
  useEffect(() => {
    const sel = pendingSelection.current;
    const ta = textareaRef.current;
    if (sel && ta) {
      ta.focus();
      ta.setSelectionRange(sel.start, sel.end);
      pendingSelection.current = null;
    }
  }, [value]);

  const commit = (newValue: string, start: number, end: number) => {
    pendingSelection.current = { start, end };
    onChange(newValue);
  };

  // Wrap the current selection with `before`/`after` (e.g. **bold**, *italic*).
  const wrap = (before: string, after: string = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);
    const next = v.slice(0, s) + before + sel + after + v.slice(e);
    commit(next, s + before.length, s + before.length + sel.length);
  };

  // Prefix each line touched by the selection (lists, quotes).
  const prefixLines = (makePrefix: (index: number) => string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    let lineEnd = v.indexOf("\n", e);
    if (lineEnd === -1) lineEnd = v.length;
    const block = v.slice(lineStart, lineEnd);
    const newBlock = block
      .split("\n")
      .map((line, i) => makePrefix(i) + line)
      .join("\n");
    const next = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
    commit(next, lineStart, lineStart + newBlock.length);
  };

  // Prefix only the line containing the caret (headings).
  const prefixCurrentLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    const next = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    commit(next, s + prefix.length, s + prefix.length);
  };

  const insertLink = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || "text";
    const snippet = `[${sel}](url)`;
    const next = v.slice(0, s) + snippet + v.slice(e);
    const urlStart = s + 1 + sel.length + 2; // position over "url"
    commit(next, urlStart, urlStart + 3);
  };

  const insertText = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const next = v.slice(0, s) + text + v.slice(e);
    commit(next, s + text.length, s + text.length);
  };

  // Paste from a web page: prefer the HTML flavor and convert to Markdown so
  // structure survives. Fall back to the browser's default plain-text paste.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData?.getData("text/html");
    if (html && html.trim()) {
      const md = htmlToMarkdown(html);
      if (md) {
        e.preventDefault();
        insertText(md);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrap("**");
    } else if (key === "i") {
      e.preventDefault();
      wrap("*");
    } else if (key === "k") {
      e.preventDefault();
      insertLink();
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-blue">
      {/* Toolbar + Write/Preview tabs */}
      <div className="flex items-center gap-0.5 border-b border-border bg-bg-subtle px-1.5 py-1">
        <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5">
          <ToolbarButton label="Bold" title="Bold (Ctrl+B)" onClick={() => wrap("**")} disabled={controlsDisabled}>
            <span className="text-sm font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Italic" title="Italic (Ctrl+I)" onClick={() => wrap("*")} disabled={controlsDisabled}>
            <span className="text-sm italic font-serif">I</span>
          </ToolbarButton>
          <ToolbarButton label="Underline" title="Underline" onClick={() => wrap("<u>", "</u>")} disabled={controlsDisabled}>
            <span className="text-sm underline">U</span>
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="Heading" title="Heading" onClick={() => prefixCurrentLine("## ")} disabled={controlsDisabled}>
            <span className="text-sm font-bold">H</span>
          </ToolbarButton>
          <ToolbarButton label="Quote" title="Blockquote" onClick={() => prefixLines(() => "> ")} disabled={controlsDisabled}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7.17 6A5.17 5.17 0 002 11.17V18h6.83v-6.83H5.5A1.67 1.67 0 017.17 9.5V6zm10 0A5.17 5.17 0 0012 11.17V18h6.83v-6.83H15.5a1.67 1.67 0 011.67-1.67V6z" /></svg>
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="Bulleted list" title="Bulleted list" onClick={() => prefixLines(() => "- ")} disabled={controlsDisabled}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
          </ToolbarButton>
          <ToolbarButton label="Numbered list" title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)} disabled={controlsDisabled}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6h11M10 12h11M10 18h11M3 6h1v4M3 10h2M4 16.5A1.5 1.5 0 105 19H3" /></svg>
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="Link" title="Link (Ctrl+K)" onClick={insertLink} disabled={controlsDisabled}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
          </ToolbarButton>
          <ToolbarButton label="Inline code" title="Inline code" onClick={() => wrap("`")} disabled={controlsDisabled}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 8l-4 4 4 4" /></svg>
          </ToolbarButton>
          <ToolbarButton label="Code block" title="Code block" onClick={() => wrap("\n```\n", "\n```\n")} disabled={controlsDisabled}>
            <span className="text-[11px] font-mono font-semibold">{"{ }"}</span>
          </ToolbarButton>
        </div>

        <div className="ml-auto flex items-center gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("write")}
            disabled={disabled}
            className={`px-2 py-1 rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mode === "write" ? "bg-bg-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            disabled={disabled}
            className={`px-2 py-1 rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mode === "preview" ? "bg-bg-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          aria-label={ariaLabel || placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full px-3 py-2 resize-y focus:outline-none disabled:bg-bg-subtle disabled:cursor-not-allowed bg-transparent text-text-primary"
        />
      ) : (
        <div
          className="px-3 py-2 min-h-[80px] overflow-auto"
          style={{ minHeight: `${Math.max(rows, 3) * 1.6}rem` }}
        >
          {value.trim() ? (
            <div
              className="rich-text text-sm text-text-primary"
              dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
            />
          ) : (
            <p className="text-sm text-text-secondary italic">Nothing to preview.</p>
          )}
        </div>
      )}

      <div className="border-t border-border bg-bg-subtle px-3 py-1 text-[11px] text-text-secondary">
        <span className="font-medium">Markdown</span> supported · paste from a web page keeps its formatting
      </div>
    </div>
  );
}
