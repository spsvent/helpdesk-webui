"use client";

import { useEffect, useRef, useState } from "react";
import { Attachment } from "@/types/ticket";
import { getFileIcon } from "./fileTypeIcon";

interface AttachmentThumbnailProps {
  attachment: Attachment;
  /** Downloads (once, cached by the parent) and returns an object URL for the file. */
  getPreviewUrl: (name: string) => Promise<string | null>;
  /**
   * Whether this tile can render inline cheaply (natively-previewable, or a HEIC
   * with an existing rendition). When false the tile shows a file-icon
   * placeholder without downloading — but stays clickable to open the lightbox,
   * which can convert on demand.
   */
  previewable?: boolean;
  /** Open the full-size lightbox for this image. */
  onOpen?: () => void;
  /** Tailwind size classes for the tile (default 64×64). */
  sizeClass?: string;
}

type LoadState = "idle" | "loading" | "ready" | "error" | "unsupported";

// A small clickable image tile shown inline in the conversation for uploaded
// image attachments. Previewable images are lazily downloaded once they scroll
// into view (SharePoint list attachments have no thumbnail endpoint, so this
// fetches the full file, cached by the parent). Non-previewable formats (HEIC
// without a rendition, TIFF, etc.) show a placeholder tile instead of downloading.
export default function AttachmentThumbnail({
  attachment,
  getPreviewUrl,
  previewable = true,
  onOpen,
  sizeClass = "w-16 h-16",
}: AttachmentThumbnailProps) {
  const [state, setState] = useState<LoadState>(previewable ? "idle" : "unsupported");
  const [url, setUrl] = useState<string | null>(null);
  const tileRef = useRef<HTMLButtonElement>(null);

  // Lazily fetch the preview once the tile is near the viewport.
  useEffect(() => {
    if (!previewable) {
      setState("unsupported");
      return;
    }
    // If a rendition just became available, drop the placeholder and show the
    // loading state right away rather than flashing the icon until the fetch runs.
    setState((s) => (s === "unsupported" || s === "error" ? "idle" : s));
    const el = tileRef.current;
    if (!el) return;

    let cancelled = false;
    const load = () => {
      setState("loading");
      getPreviewUrl(attachment.name)
        .then((u) => {
          if (cancelled) return;
          if (u) {
            setUrl(u);
            setState("ready");
          } else {
            setState("error");
          }
        })
        .catch(() => {
          if (!cancelled) setState("error");
        });
    };

    // If IntersectionObserver isn't available, just load immediately.
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // getPreviewUrl is included so that if it changes (its ticket.id closure
    // updates), the observer re-subscribes and fetches from the correct ticket.
  }, [attachment.name, previewable, getPreviewUrl]);

  const base = `${sizeClass} shrink-0 rounded-lg border border-border overflow-hidden bg-bg-subtle flex items-center justify-center relative group focus:outline-none focus:ring-2 focus:ring-brand-blue transition-shadow hover:shadow-md`;

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={onOpen}
      className={base}
      title={`Preview ${attachment.name}`}
      aria-label={`Preview ${attachment.name}`}
    >
      {state === "ready" && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.name} className="w-full h-full object-cover" />
      ) : state === "loading" || state === "idle" ? (
        <svg className="animate-spin h-5 w-5 text-text-secondary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        // "unsupported" (e.g. HEIC) or "error": show a file icon placeholder.
        <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
          {getFileIcon(attachment.contentType, attachment.name, "w-6 h-6")}
          <span className="text-[9px] leading-none uppercase text-text-secondary truncate max-w-full">
            {attachment.name.split(".").pop()}
          </span>
        </div>
      )}

      {/* Expand affordance overlay */}
      <span className="absolute bottom-0 right-0 m-0.5 rounded bg-black/55 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </span>
    </button>
  );
}
