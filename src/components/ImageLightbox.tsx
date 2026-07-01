"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Attachment } from "@/types/ticket";
import { isBrowserPreviewable } from "@/lib/attachmentComments";
import { formatFileSize } from "./fileTypeIcon";

interface ImageLightboxProps {
  /** The full image gallery to page through (all image attachments on the ticket). */
  images: Attachment[];
  /** Index of the image currently shown. */
  index: number;
  getPreviewUrl: (name: string) => Promise<string | null>;
  /**
   * Synchronous peek into the parent's preview cache. When it returns a URL,
   * the image is shown immediately — no spinner frame on returning to an
   * already-fetched image.
   */
  peekPreviewUrl?: (name: string) => string | null;
  /** Whether an image can be shown inline (HEIC may convert on demand). */
  canPreview?: (name: string) => boolean;
  /**
   * Whether a neighbor is cheap enough to prefetch (native format, or a HEIC
   * that already has a rendition). Used to avoid triggering on-demand conversion
   * of images the user hasn't actually opened. Defaults to `canPreview`.
   */
  canPreloadNeighbor?: (name: string) => boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownload: (name: string) => void;
}

type LoadState = "loading" | "ready" | "error" | "unsupported";

// Full-screen image viewer with prev/next paging, keyboard controls (←/→/Esc),
// and a download fallback for formats that can't be shown inline (e.g. HEIC when
// backend conversion isn't available).
// Everything the stage needs to render one image, keyed by its name so
// navigation can reset it synchronously (see the render-phase check below).
interface ImageView {
  name: string;
  state: LoadState;
  url: string | null;
}

export default function ImageLightbox({
  images,
  index,
  getPreviewUrl,
  peekPreviewUrl,
  canPreview,
  canPreloadNeighbor,
  onClose,
  onNavigate,
  onDownload,
}: ImageLightboxProps) {
  // Default to the native check when the parent doesn't supply a resolver.
  const previewable = canPreview ?? isBrowserPreviewable;
  // Neighbors are only prefetched when cheap (no on-demand conversion).
  const preloadable = canPreloadNeighbor ?? previewable;
  const current = images[index];
  const count = images.length;

  const initialViewFor = useCallback(
    (name: string | undefined): ImageView => {
      if (!name) return { name: "", state: "loading", url: null };
      if (!previewable(name)) return { name, state: "unsupported", url: null };
      const cached = peekPreviewUrl?.(name) ?? null;
      return cached
        ? { name, state: "ready", url: cached }
        : { name, state: "loading", url: null };
    },
    [previewable, peekPreviewUrl]
  );

  const [view, setView] = useState<ImageView>(() => initialViewFor(images[index]?.name));
  const dialogRef = useRef<HTMLDivElement>(null);

  const goPrev = useCallback(() => {
    if (count > 1) onNavigate((index - 1 + count) % count);
  }, [count, index, onNavigate]);

  const goNext = useCallback(() => {
    if (count > 1) onNavigate((index + 1) % count);
  }, [count, index, onNavigate]);

  // Names drive loading (not the array identity), so appending an unrelated
  // attachment while the lightbox is open doesn't re-fetch the current image.
  const currentName = current?.name;
  const nextName = count > 1 ? images[(index + 1) % count]?.name : undefined;
  const prevName = count > 1 ? images[(index - 1 + count) % count]?.name : undefined;

  // Reset the view synchronously when navigating (React's supported
  // "adjust state during render" pattern): the replacement render happens
  // before paint, so a cached image never flashes the spinner — and a
  // non-cached one never flashes the previous image.
  if (view.name !== (currentName ?? "")) {
    setView(initialViewFor(currentName));
  }

  // Load the current image (and warm the neighbors' cache for snappy paging).
  useEffect(() => {
    if (!currentName) return;
    let cancelled = false;

    // Fetch unless unsupported or already served synchronously from the cache.
    if (previewable(currentName) && !peekPreviewUrl?.(currentName)) {
      getPreviewUrl(currentName)
        .then((u) => {
          if (cancelled) return;
          setView((v) => {
            if (v.name !== currentName) return v; // stale: user navigated away
            return u ? { name: currentName, state: "ready", url: u } : { ...v, state: "error" };
          });
        })
        .catch(() => {
          if (!cancelled) {
            setView((v) => (v.name === currentName ? { ...v, state: "error" } : v));
          }
        });
    }

    // Warm neighbors so Next/Prev is instant. Fire-and-forget, cache-deduped.
    // Only cheap neighbors (no on-demand conversion) are prefetched.
    [nextName, prevName].forEach((n) => {
      if (n && preloadable(n)) getPreviewUrl(n).catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [currentName, nextName, prevName, previewable, preloadable, getPreviewUrl, peekPreviewUrl]);

  // On open: lock background scroll and move focus into the dialog; restore both
  // (scroll + the previously-focused element) when it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Keyboard: Esc closes, ←/→ page, Tab is trapped within the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // preventDefault so the keys act only on the lightbox (no background
      // scroll of focused containers, no other Escape handlers).
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); return; }
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/80 flex flex-col focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${current.name}`}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{current.name}</p>
          <p className="text-xs text-white/60">
            {count > 1 ? `${index + 1} of ${count}` : "1 image"}
            {current.size > 0 ? ` · ${formatFileSize(current.size)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDownload(current.name)}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            title="Download"
            aria-label="Download image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/15 transition-colors"
            title="Close (Esc)"
            aria-label="Close preview"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image stage */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0 relative">
        {/* Prev */}
        {count > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
            title="Previous (←)"
            aria-label="Previous image"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div
          className="max-w-full max-h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {view.state === "ready" && view.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.url}
              alt={current.name}
              className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-lg shadow-2xl"
            />
          ) : view.state === "loading" ? (
            <svg className="animate-spin h-10 w-10 text-white/80" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            // "unsupported" (HEIC/TIFF) or "error"
            <div className="text-center text-white/80 px-6 py-10 max-w-sm">
              <svg className="w-14 h-14 mx-auto mb-3 text-white/50" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm mb-4">
                {view.state === "unsupported"
                  ? "This file type can't be previewed in the browser."
                  : "Couldn't load this image."}
              </p>
              <button
                type="button"
                onClick={() => onDownload(current.name)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download to view
              </button>
            </div>
          )}
        </div>

        {/* Next */}
        {count > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
            title="Next (→)"
            aria-label="Next image"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
