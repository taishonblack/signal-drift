import { useLocation, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  getCurrentUserRef,
  endSession,
  resumeSession,
} from "@/lib/session-store";
import { toast } from "@/hooks/use-toast";

/**
 * Global idle warning modal. Rendered inside AppLayout.
 *
 * Shown when the current session is idle (no fresh presence for the grace
 * period) and the user is on any app page other than the Session Room /
 * fullscreen / landing. The dialog stays open until the user chooses to
 * resume or end the session, or until the idle deadline elapses and the
 * global sweep marks the session ended.
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
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            Monitoring session idle
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            No one is currently viewing{" "}
            <span className="text-foreground">{session.name}</span>. It will end
            automatically in{" "}
            <span className="text-foreground font-mono">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-wrap sm:justify-end">
          <Button variant="destructive" size="sm" onClick={handleEndNow}>
            End Session Now
          </Button>
          <Button variant="outline" size="sm" onClick={handleResume}>
            Continue Monitoring
          </Button>
          <Button size="sm" onClick={handleReturn}>
            Return to Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IdleSessionWarning;
