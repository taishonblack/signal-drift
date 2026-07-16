import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  getCurrentUserRef,
  endSession,
  resumeSession,
  getSessionById,
} from "@/lib/session-store";
import { saveSessionRemote } from "@/lib/sessions-remote";
import { useIdentity } from "@/lib/identity";
import { toast } from "@/hooks/use-toast";

/**
 * Global monitoring-session idle modal.
 *
 * Timer semantics:
 *  - Starts a single 15-minute setTimeout when the user has an active
 *    session AND is NOT on the Session Room (or fullscreen) page.
 *  - Returning to the Session Room clears the timer and hides the modal.
 *  - Any active-session or route change resets the timer.
 *  - On fire, verifies the session is still `active` and has no fresh
 *    viewers; otherwise cancels silently.
 */

const IDLE_TIMEOUT_MS = 15 * 60_000;
const VIEWER_FRESH_MS = 90_000;

const IdleSessionWarning = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useIdentity();
  const { session } = useCurrentSession(5000);

  const [showIdle, setShowIdle] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Sessions the user has explicitly ended in this tab — never re-open modal.
  const endedIdsRef = useRef<Set<string>>(new Set());

  const path = location.pathname;
  const inSessionRoom =
    path.startsWith("/session/") && !path.endsWith("/configure");
  const isFullscreen =
    new URLSearchParams(location.search).get("fullscreen") === "1";

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(
    (sessionId: string) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const current = getSessionById(sessionId);
        if (!current) return;
        if (current.status !== "active") return;
        if (current.endedAt) return;
        if (endedIdsRef.current.has(sessionId)) return;
        const now = Date.now();
        const fresh = (current.viewers ?? []).filter(
          (v) => v.lastHeartbeatAt && now - v.lastHeartbeatAt < VIEWER_FRESH_MS,
        );
        if (fresh.length > 0) {
          // Viewers are still present — reschedule.
          scheduleIdle(sessionId);
          return;
        }
        setShowIdle(true);
      }, IDLE_TIMEOUT_MS);
    },
    [clearTimer],
  );

  // Drive the timer from session identity + route.
  useEffect(() => {
    if (!session || session.status !== "active") {
      clearTimer();
      setShowIdle(false);
      return;
    }
    if (endedIdsRef.current.has(session.id)) {
      clearTimer();
      setShowIdle(false);
      return;
    }
    if (inSessionRoom || isFullscreen) {
      // On the session page — reset everything.
      clearTimer();
      setShowIdle(false);
      return;
    }
    // Away from session — start a fresh 15-min timer.
    if (!showIdle) scheduleIdle(session.id);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, path, inSessionRoom, isFullscreen]);

  // If the session ends externally (e.g. remote hydrate), close the modal.
  useEffect(() => {
    if (!session || session.status !== "active") {
      setShowIdle(false);
      setShowConfirmEnd(false);
    }
  }, [session?.status]);

  if (!session || session.status !== "active" || endedIdsRef.current.has(session.id)) {
    return null;
  }

  const scheduledEndLabel = null; // scheduled-end display owned by ScheduledEndDialog

  const handleContinue = () => {
    resumeSession(session.id, getCurrentUserRef());
    setShowIdle(false);
    scheduleIdle(session.id);
    toast({ title: "Monitoring resumed", description: session.name });
  };

  const handleReturn = () => {
    resumeSession(session.id, getCurrentUserRef());
    setShowIdle(false);
    clearTimer();
    navigate(`/session/${session.id}`);
  };

  const handleRequestEnd = () => setShowConfirmEnd(true);

  const handleConfirmEnd = async () => {
    if (!session) return;
    setEnding(true);
    const sid = session.id;
    endedIdsRef.current.add(sid);
    clearTimer();
    setShowIdle(false);
    endSession(sid, new Date().toISOString(), "owner_ended");
    // Persist to remote so hydrate can't resurrect it.
    if (identity.kind === "member") {
      try {
        const updated = getSessionById(sid);
        if (updated) await saveSessionRemote(updated);
      } catch {
        /* soft-fail: local end is authoritative for this tab */
      }
    }
    setShowConfirmEnd(false);
    setEnding(false);
    toast({ title: "Session ended", description: session.name });
  };

  return (
    <>
      <Dialog open={showIdle && !showConfirmEnd}>
        <DialogContent className="mako-glass-solid border-border/20 sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
              Monitoring session idle
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              No one has been viewing{" "}
              <span className="text-foreground">{session.name}</span> for
              15&nbsp;minutes.
            </DialogDescription>
          </DialogHeader>

          <div className="pt-4 flex flex-col-reverse sm:grid sm:grid-cols-3 gap-2 sm:gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRequestEnd}
              className="w-full sm:order-1"
            >
              End Session
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleContinue}
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
          {scheduledEndLabel}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showConfirmEnd}
        onOpenChange={(o) => !o && !ending && setShowConfirmEnd(false)}
      >
        <DialogContent className="mako-glass-solid border-border/20 sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              End this monitoring session?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              This will stop monitoring and move the session to recent
              sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmEnd(false)}
              disabled={ending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmEnd}
              disabled={ending}
            >
              End Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IdleSessionWarning;
