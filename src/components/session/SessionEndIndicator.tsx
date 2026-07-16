import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  formatEndsAt,
  formatRemaining,
  getTimingState,
  msRemaining,
} from "@/lib/session-timing";

interface Props {
  scheduledEndAt?: string | null;
  timeZone?: string;
  /** Compact variant for cramped toolbars. */
  compact?: boolean;
}

/**
 * Displays "Ends at 8:30 PM EDT · 1h 24m remaining" using the session's
 * absolute scheduled_end_at as the single source of truth. Uses the
 * session's Default Event Time Zone for the clock label. Warning tone
 * kicks in below 15 minutes; stronger warning below 5 minutes.
 */
const SessionEndIndicator = ({ scheduledEndAt, timeZone, compact }: Props) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!scheduledEndAt) return null;

  const state = getTimingState(scheduledEndAt);
  const remaining = msRemaining(scheduledEndAt);
  const endsAt = formatEndsAt(scheduledEndAt, timeZone);

  const toneClass =
    state === "finalMinutes" || state === "reached"
      ? "text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/[0.08]"
      : state === "endingSoon"
        ? "text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.08]"
        : "text-muted-foreground border-border/25 bg-muted/10";

  const remainingLabel =
    state === "reached" ? "Scheduled end reached" : `${formatRemaining(remaining)} remaining`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
      title={`Scheduled end: ${endsAt}`}
    >
      <Clock className="h-3 w-3" />
      <span>Ends at {endsAt}</span>
      {!compact && (
        <>
          <span className="text-foreground/30">·</span>
          <span className="font-mono">{remainingLabel}</span>
        </>
      )}
    </span>
  );
};

export default SessionEndIndicator;
