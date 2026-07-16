import { useLocation, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  getCurrentUserRef,
  endSession,
  resumeSession,
} from "@/lib/session-store";
import { formatEndsAt } from "@/lib/session-timing";
import { toast } from "@/hooks/use-toast";

/**
 * Global idle warning modal. Rendered inside AppLayout.
 *
 * Shown when the current session is idle (no fresh presence for the
 * grace period) and the user is on any app page other than the Session
 * Room / fullscreen / landing. The dialog is a purely idle-driven
 * lifecycle — it never triggers off scheduled_end_at.
 */
const IdleSessionWarning = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isIdle, msUntilIdleEnd } = useCurrentSession(1000);

  const path = location.pathname;
  const inSessionRoom =
    path.startsWith("/session/") && !path.endsWith("/configure");
  const isLanding = path === "/";
  const isFullscreen =
    new URLSearchParams(location.search).get("fullscreen") === "1";

  if (!session || !isIdle || inSessionRoom || isLanding || isFullscreen) {
    return null;
  }

  const remainingMs = msUntilIdleEnd ?? 0;
  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const scheduledEndLabel = session.scheduledEndAt
    ? formatEndsAt(session.scheduledEndAt, session.defaultOriginTimeZone)
    : null;

  const handleResume = () => {
    resumeSession(session.id, getCurrentUserRef());
    toast({ title: "Monitoring resumed", description: session.name });
  };

  const handleReturn = () => {
    resumeSession(session.id, getCurrentUserRef());
    navigate(`/session/${session.id}`);
  };

  const handleEndNow = () => {
    endSession(session.id, new Date().toISOString(), "owner_ended");
    toast({ title: "Session ended" });
  };

  return (
    <Dialog open>
      <DialogContent
        className="mako-glass-solid border-border/20 sm:max-w-[720px]"
      >
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            Monitoring session idle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1 text-xs">
          <p className="text-muted-foreground">
            No one is currently viewing{" "}
            <span className="text-foreground">{session.name}</span>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/[0.06] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Idle timeout
              </p>
              <p className="font-mono text-base text-foreground mt-0.5">
                {mins}:{String(secs).padStart(2, "0")}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Session will end automatically if no one returns.
              </p>
            </div>

            {scheduledEndLabel && (
              <div className="rounded-md border border-border/20 bg-muted/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Scheduled end
                </p>
                <p className="font-mono text-base text-foreground mt-0.5">
                  {scheduledEndLabel}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Separate from the idle timer.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop: single row of three balanced actions.
            Mobile: stacked, Return-first / End-last per spec. */}
        <div className="pt-4 flex flex-col-reverse sm:grid sm:grid-cols-3 gap-2 sm:gap-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndNow}
            className="w-full sm:order-1"
          >
            End Session
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResume}
            className="w-full sm:order-2"
          >
            Continue Monitoring
          </Button>
          <Button
            size="sm"
            onClick={handleReturn}
            className="w-full sm:order-3"
          >
            Return to Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IdleSessionWarning;
