import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimelinePanel from "@/components/session/TimelinePanel";
import { useSessionTimeline } from "@/hooks/use-session-timeline";
import type { StreamInput } from "@/lib/mock-data";
import { clearMemberIdentity, ensureIdentity, setMemberIdentity, useIdentity } from "@/lib/identity";
import type { SessionRecord } from "@/lib/session-store";
import { loadAuthorizedSession } from "@/lib/sessions-remote";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Standalone Timeline view rendered inside a detached browser window.
 * Uses the same `useSessionTimeline` hook as the docked panel, so
 * updates flow between the popout and the main window via Supabase
 * realtime for signed-in users.
 */
const TimelinePopoutPage = () => {
  const { sessionId } = useParams();
  const auth = useAuth();
  const identity = useIdentity();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [focusedInputId, setFocusedInputId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.user) {
      setMemberIdentity({ id: auth.user.id, email: auth.user.email, name: (auth.user.user_metadata as { name?: string })?.name });
    } else {
      clearMemberIdentity();
      ensureIdentity();
    }
  }, [auth.loading, auth.user]);

  useEffect(() => {
    if (auth.loading || !sessionId) return;
    let cancelled = false;
    setSessionLoading(true);
    (async () => {
      try {
        const found = auth.user
          ? await loadAuthorizedSession(sessionId)
          : (await import("@/lib/session-store")).getSessionById(sessionId) ?? null;
        if (!cancelled) {
          setSession(found);
          setUnavailable(!found);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.loading, auth.user, sessionId]);

  useEffect(() => {
    if (auth.loading || !auth.user || !sessionId) return;
    supabase.from("session_focus").select("focused_input_id").eq("session_id", sessionId)
      .maybeSingle().then(({ data }) => setFocusedInputId(data?.focused_input_id ?? null));
  }, [auth.loading, auth.user, sessionId]);

  const timeline = useSessionTimeline(sessionId, { user: auth.user, loading: auth.loading });
  const activeInputs = useMemo<StreamInput[]>(() => (session?.lines ?? [])
    .filter((line) => line.enabled)
    .map((line) => ({
      id: `line-${line.id}`, label: line.label, enabled: line.enabled,
      srtAddress: line.srtAddress, passphrase: line.passphrase, status: "idle",
      metrics: { bitrate: 0, packetLoss: 0, rtt: 0, codec: "", resolution: "", fps: 0, audioChannels: 0, audioSampleRate: 0, lufs: 0 },
    })), [session]);
  const focused = activeInputs.find((input) => input.id === focusedInputId) ?? activeInputs[0];

  useEffect(() => {
    if (session) document.title = `Timeline · ${session.name} — MAKO Popout`;
  }, [session]);

  const returnToSession = () => {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        /* ignore */
      }
    }
  };

  if (auth.loading) return <div className="fixed inset-0 bg-background flex items-center justify-center text-sm text-muted-foreground">Loading session Timeline…</div>;
  if (sessionLoading) return <div className="fixed inset-0 bg-background flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  if (unavailable || !session) return <div className="fixed inset-0 bg-background flex items-center justify-center text-sm text-muted-foreground">Session unavailable or access revoked.</div>;

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
          {!auth.user && identity.kind === "guest" && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">
              Guest · not saved
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
          focusedInputId={focused?.id ?? null}
          focusedLabel={focused?.label ?? "Session"}
          inputs={activeInputs}
          entries={timeline.entries}
          ready={timeline.ready && !timeline.loading}
          isMember={timeline.isMember}
          eventTimeZone={session.defaultOriginTimeZone || "UTC"}
          onAdd={timeline.addEntry}
          onDelete={timeline.deleteEntry}
          currentUserId={auth.user?.id ?? identity.id}
        />
      </div>
    </div>
  );
};

export default TimelinePopoutPage;
