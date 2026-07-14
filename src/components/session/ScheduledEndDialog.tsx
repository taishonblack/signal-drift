import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  /** Scheduled end ISO string, or null when there is no schedule. */
  scheduledEndAt: string | null;
  onExtend: (minutes: number) => void;
  onEnd: () => void;
}

const AUTO_END_MS = 15 * 60 * 1000; // 15 minutes of no response

/**
 * Shows a "still monitoring?" prompt when the scheduled end time is reached
 * and auto-ends the session after 15 minutes without a response.
 */
const ScheduledEndDialog = ({ scheduledEndAt, onExtend, onEnd }: Props) => {
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_END_MS);

  // Watch the scheduled end and trigger the prompt when it passes.
  useEffect(() => {
    if (!scheduledEndAt) return;
    const target = new Date(scheduledEndAt).getTime();
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleEnd(); }}>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            This session is scheduled to end
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Are you still monitoring? If no activity is detected, MAKO will end the session in{" "}
            <span className="text-foreground font-mono">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => handleExtend(30)}>
            Extend 30 min
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExtend(60)}>
            Extend 1 hr
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
