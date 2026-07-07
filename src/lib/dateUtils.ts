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
 * Format a date as a clean "Mon D, YYYY" with no time component.
 *
 * Tolerates both shapes the app stores for approval/date columns: date-only
 * ("2026-07-02", written by in-app decisions) and full ISO
 * ("2026-07-02T21:31:37Z", written by the email-approval Function). Date-only
 * strings are built from their calendar parts so they aren't shifted to the
 * previous day by UTC-midnight parsing in negative-offset timezones. Returns the
 * raw input unchanged if it can't be parsed.
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
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
