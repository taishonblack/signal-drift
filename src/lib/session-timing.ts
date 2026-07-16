// Session timing helpers — single source of truth for computing
// remaining time, timing status, and formatted end labels from a
// session's absolute scheduled_end_at timestamp.

export type TimingState =
  | "none"
  | "scheduled"
  | "endingSoon"
  | "finalMinutes"
  | "reached";

const FIFTEEN_MIN = 15 * 60_000;
const FIVE_MIN = 5 * 60_000;

export function getTimingState(scheduledEndAt?: string | null, now = Date.now()): TimingState {
  if (!scheduledEndAt) return "none";
  const end = new Date(scheduledEndAt).getTime();
  if (Number.isNaN(end)) return "none";
  const remaining = end - now;
  if (remaining <= 0) return "reached";
  if (remaining <= FIVE_MIN) return "finalMinutes";
  if (remaining <= FIFTEEN_MIN) return "endingSoon";
  return "scheduled";
}

/** Milliseconds remaining until scheduled_end_at (never negative). */
export function msRemaining(scheduledEndAt?: string | null, now = Date.now()): number {
  if (!scheduledEndAt) return 0;
  const end = new Date(scheduledEndAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - now);
}

/** "1h 24m" · "5m 12s" · "0s" */
export function formatRemaining(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Short mobile-friendly variant: "1h 24m left" or "45m left". */
export function formatRemainingShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  if (m >= 1) return `${m}m left`;
  return `${totalSec}s left`;
}

/** "8:30 PM EDT" — uses session's default event time zone. */
export function formatEndsAt(scheduledEndAt?: string | null, timeZone?: string): string {
  if (!scheduledEndAt) return "";
  try {
    const d = new Date(scheduledEndAt);
    return new Intl.DateTimeFormat([], {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: timeZone || undefined,
    }).format(d);
  } catch {
    return new Date(scheduledEndAt).toLocaleTimeString();
  }
}
