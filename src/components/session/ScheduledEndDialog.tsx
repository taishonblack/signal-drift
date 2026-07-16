import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatEndsAt } from "@/lib/session-timing";

interface Props {
  /** Scheduled end ISO string, or null when there is no schedule. */
  scheduledEndAt: string | null;
  /** Session's default event time zone (for the "8:30 PM EDT" label). */
  timeZone?: string;
  onExtend: (minutes: number) => void;
  onEnd: () => void;
}

const AUTO_END_MS = 10 * 60 * 1000; // 10 minute grace after scheduled end

/**
 * Scheduled End Reached prompt. Opens ONLY when the wall clock has
 * passed the absolute scheduled_end_at timestamp — never on idle,
 * viewer, route, or presence changes. If the user does not respond
 * within the grace period the session ends automatically.
 */
const ScheduledEndDialog = ({ scheduledEndAt, timeZone, onExtend, onEnd }: Props) => {
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_END_MS);

  // Watch the scheduled end and trigger the prompt when it passes.
  // Any downstream extension updates scheduled_end_at, which re-runs
  // this effect and re-arms the check against the new target.
  useEffect(() => {
    setOpen(false);
    if (!scheduledEndAt) return;
    const target = new Date(scheduledEndAt).getTime();
    if (Number.isNaN(target)) return;
    const check = () => {
      if (Date.now() >= target) setOpen(true);
    };
    check();
    const id = setInterval(check, 5_000);
    return () => clearInterval(id);
  }, [scheduledEndAt]);

  // Auto-end countdown while the dialog is open.
  useEffect(() => {
    if (!open) return;
    setCountdown(AUTO_END_MS);
    const start = Date.now();
    const id = setInterval(() => {
      const left = AUTO_END_MS - (Date.now() - start);
      if (left <= 0) {
        clearInterval(id);
        setOpen(false);
        onEnd();
        return;
      }
      setCountdown(left);
    }, 1000);
    return () => clearInterval(id);
  }, [open, onEnd]);

  const handleExtend = (minutes: number) => {
    setOpen(false);
    onExtend(minutes);
  };

  const handleEnd = () => {
    setOpen(false);
    onEnd();
  };

  const mins = Math.floor(countdown / 60_000);
  const secs = Math.floor((countdown % 60_000) / 1000);
  const endLabel = formatEndsAt(scheduledEndAt, timeZone);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            Scheduled end reached
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            This session was scheduled to end at{" "}
            <span className="text-foreground">{endLabel}</span>. It will end
            automatically in{" "}
            <span className="text-foreground font-mono">
              {mins}:{String(secs).padStart(2, "0")}
            </span>{" "}
            unless extended.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => handleExtend(30)}>
            Extend 30 Minutes
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExtend(60)}>
            Extend 1 Hour
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEnd}>
            End Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduledEndDialog;
