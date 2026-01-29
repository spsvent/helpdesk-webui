"use client";

interface EmptyStateProps {
  variant?: "no-tickets" | "no-results" | "filtered";
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

/**
 * Themed empty state component with illustrations
 * Supports different variants for different empty scenarios
 */
export default function EmptyState({
  variant = "no-tickets",
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  const defaultContent: Record<string, { title: string; description: string; actionLabel: string; actionHref?: string }> = {
    "no-tickets": {
      title: "No tickets yet",
      description: "Create your first support ticket to get started.",
      actionLabel: "+ New Ticket",
      actionHref: "/new",
    },
    "no-results": {
      title: "No matching tickets",
      description: "Try adjusting your search or filters to find what you're looking for.",
      actionLabel: "Clear filters",
    },
    "filtered": {
      title: "All caught up!",
      description: "There are no tickets matching your current filters.",
      actionLabel: "View all tickets",
    },
  };

  const content = defaultContent[variant];
  const displayTitle = title || content.title;
  const displayDescription = description || content.description;
  const displayActionLabel = actionLabel || content.actionLabel;
  const displayActionHref = actionHref || content.actionHref;

  return (
    <div className="p-8 text-center empty-state">
      {/* Illustration */}
      <div className="mb-6 empty-state-illustration">
        {variant === "no-tickets" ? (
          <NoTicketsIllustration />
        ) : variant === "no-results" ? (
          <NoResultsIllustration />
        ) : (
          <AllCaughtUpIllustration />
        )}
      </div>

      {/* Text content */}
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-2">
          {displayTitle}
        </h3>
        <p className="text-sm text-text-secondary max-w-xs mx-auto">
          {displayDescription}
        </p>
      </div>

      {/* Action button */}
      {(displayActionHref || onAction) && displayActionLabel && (
        displayActionHref ? (
          <a
            href={displayActionHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-all hover:scale-105"
          >
            {displayActionLabel}
          </a>
        ) : (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white text-sm rounded-lg font-medium hover:bg-brand-primary-light transition-all hover:scale-105"
          >
            {displayActionLabel}
          </button>
        )
      )}
    </div>
  );
}

/**
 * Empty inbox illustration - stylized ticket/document with nature elements
 */
function NoTicketsIllustration() {
  return (
    <svg
      className="w-32 h-32 mx-auto"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle
        cx="64"
        cy="64"
        r="56"
        className="fill-bg-subtle"
        opacity="0.5"
      />

      {/* Ticket/document shape */}
      <rect
        x="36"
        y="28"
        width="56"
        height="72"
        rx="4"
        className="fill-bg-card stroke-border"
        strokeWidth="2"
      />

      {/* Ticket header accent */}
      <rect
        x="36"
        y="28"
        width="56"
        height="16"
        rx="4"
        className="fill-brand-primary"
        opacity="0.15"
      />

      {/* Document lines */}
      <rect x="46" y="52" width="36" height="4" rx="2" className="fill-border" />
      <rect x="46" y="62" width="28" height="4" rx="2" className="fill-border" />
      <rect x="46" y="72" width="32" height="4" rx="2" className="fill-border" />
      <rect x="46" y="82" width="20" height="4" rx="2" className="fill-border" />

      {/* Plus icon */}
      <circle cx="92" cy="92" r="16" className="fill-brand-primary" />
      <rect x="88" y="84" width="8" height="16" rx="2" fill="white" />
      <rect x="84" y="88" width="16" height="8" rx="2" fill="white" />

      {/* Decorative leaf - top right */}
      <path
        d="M98 20C98 20 102 24 102 30C102 36 98 40 92 40C92 40 96 34 96 28C96 22 98 20 98 20Z"
        className="fill-brand-secondary"
        opacity="0.6"
      />

      {/* Decorative leaf - bottom left */}
      <path
        d="M26 84C26 84 30 80 36 80C42 80 46 84 46 90C46 90 40 86 34 86C28 86 26 84 26 84Z"
        className="fill-brand-accent"
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * No search results illustration - magnifying glass with question mark
 */
function NoResultsIllustration() {
  return (
    <svg
      className="w-32 h-32 mx-auto"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle
        cx="64"
        cy="64"
        r="56"
        className="fill-bg-subtle"
        opacity="0.5"
      />

      {/* Magnifying glass circle */}
      <circle
        cx="56"
        cy="52"
        r="28"
        className="fill-bg-card stroke-brand-primary"
        strokeWidth="4"
      />

      {/* Magnifying glass handle */}
      <rect
        x="76"
        y="74"
        width="12"
        height="30"
        rx="6"
        transform="rotate(-45 76 74)"
        className="fill-brand-primary"
      />

      {/* Question mark in glass */}
      <text
        x="56"
        y="60"
        textAnchor="middle"
        className="fill-text-secondary"
        fontSize="28"
        fontWeight="600"
        fontFamily="Georgia, serif"
      >
        ?
      </text>

      {/* Small floating documents */}
      <rect
        x="88"
        y="24"
        width="16"
        height="20"
        rx="2"
        className="fill-bg-card stroke-border"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <rect
        x="20"
        y="72"
        width="14"
        height="18"
        rx="2"
        className="fill-bg-card stroke-border"
        strokeWidth="1.5"
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * All caught up illustration - checkmark with celebration
 */
function AllCaughtUpIllustration() {
  return (
    <svg
      className="w-32 h-32 mx-auto"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle
        cx="64"
        cy="64"
        r="56"
        className="fill-bg-subtle"
        opacity="0.5"
      />

      {/* Main checkmark circle */}
      <circle
        cx="64"
        cy="64"
        r="36"
        className="fill-brand-primary"
        opacity="0.15"
      />
      <circle
        cx="64"
        cy="64"
        r="36"
        className="stroke-brand-primary"
        strokeWidth="3"
        fill="none"
      />

      {/* Checkmark */}
      <path
        d="M48 64L60 76L80 52"
        className="stroke-brand-primary"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Celebration sparkles */}
      <circle cx="98" cy="36" r="4" className="fill-brand-accent" />
      <circle cx="28" cy="44" r="3" className="fill-brand-secondary" />
      <circle cx="102" cy="84" r="3" className="fill-brand-accent" opacity="0.7" />
      <circle cx="24" cy="88" r="2" className="fill-brand-secondary" opacity="0.6" />

      {/* Star sparkle */}
      <path
        d="M92 56L94 52L96 56L100 58L96 60L94 64L92 60L88 58L92 56Z"
        className="fill-brand-accent"
      />
    </svg>
  );
}
