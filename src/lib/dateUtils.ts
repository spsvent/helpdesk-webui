/**
 * Shared date formatting utilities for the Help Desk app
 */

/**
 * Check if two dates are the same calendar day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if a date is yesterday relative to another date
 */
function isYesterday(date: Date, relativeTo: Date): boolean {
  const yesterday = new Date(relativeTo);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

/**
 * Format a date as a relative time string
 * - "Just now" / "Xm ago" / "Xh ago" for today
 * - "Yesterday" for yesterday
 * - Full date (e.g., "Jan 28, 2026") for anything older
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  // Check if today
  if (isSameDay(date, now)) {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  }

  // Check if yesterday
  if (isYesterday(date, now)) {
    return "Yesterday";
  }

  // Full date for anything older
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date with month, day, year, and time
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
