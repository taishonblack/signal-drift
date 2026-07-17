import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimelinePanel from "@/components/session/TimelinePanel";
import { useSessionTimeline } from "@/hooks/use-session-timeline";
import { mockSessions } from "@/lib/mock-data";
import { useIdentity, ensureIdentity } from "@/lib/identity";
import { getCurrentUserRef } from "@/lib/session-store";

/**
 * Standalone Timeline view rendered inside a detached browser window.
 * Uses the same `useSessionTimeline` hook as the docked panel, so
 * updates flow between the popout and the main window via Supabase
 * realtime for signed-in users.
 */
const TimelinePopoutPage = () => {
  const { sessionId } = useParams();
  ensureIdentity();
  const identity = useIdentity();
  const currentUserRef = getCurrentUserRef();
  const session = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];
  const activeInputs = session.inputs.filter((i) => i.enabled);
  const timeline = useSessionTimeline(sessionId);

  useEffect(() => {
    document.title = `Timeline · ${session.name} — MAKO Popout`;
  }, [session.name]);

  const returnToSession = () => {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            Popout
          </span>
          <span className="text-sm font-medium truncate">Timeline</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
            {session.name}
          </span>
          {identity.kind !== "member" && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">
              Guest · not shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={returnToSession}
          >
            Focus Session
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => window.close()}
            aria-label="Close popout"
            title="Close popout"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-2">
        <TimelinePanel
          focusedInputId={activeInputs[0]?.id ?? null}
          focusedLabel={activeInputs[0]?.label ?? "Session"}
          inputs={activeInputs}
          entries={timeline.entries}
          ready={timeline.ready}
          isMember={timeline.isMember}
          eventTimeZone="America/Los_Angeles"
          onAdd={timeline.addEntry}
          onDelete={timeline.deleteEntry}
          currentUserId={currentUserRef.id}
        />
      </div>
    </div>
  );
};

export default TimelinePopoutPage;
