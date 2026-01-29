"use client";

/**
 * Themed loading spinner component
 * Shows three bouncing dots with staggered animation
 * Works with both Forest Adventure and Santa's Village themes
 */
export default function LoadingSpinner({
  message = "Loading...",
  size = "default"
}: {
  message?: string;
  size?: "small" | "default" | "large";
}) {
  const sizeClasses = {
    small: "h-2 w-2",
    default: "h-3 w-3",
    large: "h-4 w-4",
  };

  const gapClasses = {
    small: "gap-1",
    default: "gap-2",
    large: "gap-3",
  };

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Bouncing dots */}
      <div className={`flex items-center ${gapClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} rounded-full bg-brand-primary loading-dot`}
          style={{ animationDelay: "0ms" }}
        />
        <div
          className={`${sizeClasses[size]} rounded-full bg-brand-accent loading-dot`}
          style={{ animationDelay: "150ms" }}
        />
        <div
          className={`${sizeClasses[size]} rounded-full bg-brand-secondary loading-dot`}
          style={{ animationDelay: "300ms" }}
        />
      </div>

      {/* Message */}
      {message && (
        <p className="mt-4 text-text-secondary text-sm font-medium loading-text">
          {message}
        </p>
      )}
    </div>
  );
}
