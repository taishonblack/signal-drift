import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, LogIn, ChevronDown, ChevronRight, Radio, BookOpen, Users, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  getSessions,
  groupSessions,
  getCurrentUserRef,
  joinSession,
  leaveSession,
  endSession,
  type SessionRecord,
} from "@/lib/session-store";
import { useIdentity } from "@/lib/identity";
import SessionCard from "@/components/session/SessionCard";
import SessionActionsDialog from "@/components/session/SessionActionsDialog";
import SwitchMonitoringSessionDialog from "@/components/session/SwitchMonitoringSessionDialog";
import ExpiredSessionDialog from "@/components/ExpiredSessionDialog";
import GatedEmptyState from "@/components/GatedEmptyState";
import { mockSessions, type Session } from "@/lib/mock-data";


interface SectionHeaderProps {
  title: string;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  right?: React.ReactNode;
}

const SectionHeader = ({ title, count, collapsible, collapsed, onToggle, right }: SectionHeaderProps) => (
  <div className="flex items-baseline justify-between mb-2 mt-4 first:mt-0">
    <button
      type="button"
      onClick={collapsible ? onToggle : undefined}
      className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${collapsible ? "hover:text-foreground" : "cursor-default"}`}
    >
      {collapsible && (
        collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />
      )}
      {title}
      <span className="ml-1 text-muted-foreground/60 font-normal">({count})</span>
    </button>
    {right}
  </div>
);

const Sessions = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUserRef();

  const [sessions, setSessions] = useState<SessionRecord[]>(() => getSessions());
  const refresh = useCallback(() => setSessions(getSessions()), []);

  useEffect(() => {
    const id = window.setInterval(refresh, 2000);
    const onFocus = () => refresh();
    const onStorage = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const grouped = useMemo(() => groupSessions(sessions, currentUser.id), [sessions, currentUser.id]);

  // Dialog state
  const [actionSession, setActionSession] = useState<SessionRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<SessionRecord | null>(null);
  const [expiredSession, setExpiredSession] = useState<Session | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const handleActiveCardClick = useCallback((s: SessionRecord) => {
    setActionSession(s);
  }, []);

  const handleJoinFromDialog = useCallback(() => {
    if (!actionSession) return;
    const target = actionSession;
    const isYourActive = grouped.yourActive?.id === target.id;
    if (isYourActive) {
      setActionSession(null);
      navigate(`/session/${target.id}`);
      return;
    }
    if (grouped.yourActive && grouped.yourActive.id !== target.id) {
      // Need to switch sessions.
      setActionSession(null);
      setPendingSwitch(target);
      return;
    }
    joinSession(target.id, currentUser);
    setActionSession(null);
    navigate(`/session/${target.id}`);
  }, [actionSession, grouped.yourActive, currentUser, navigate]);

  const handleConfigureFromDialog = useCallback(() => {
    if (!actionSession) return;
    const id = actionSession.id;
    setActionSession(null);
    navigate(`/session/${id}/configure`);
  }, [actionSession, navigate]);

  const confirmSwitch = useCallback(() => {
    if (!pendingSwitch || !grouped.yourActive) return;
    const current = grouped.yourActive;
    const isOwner = (current.ownerUserId ?? current.hostUserId) === currentUser.id;
    if (isOwner) {
      endSession(current.id);
    } else {
      leaveSession(current.id, currentUser.id);
    }
    joinSession(pendingSwitch.id, currentUser);
    const id = pendingSwitch.id;
    setPendingSwitch(null);
    navigate(`/session/${id}`);
  }, [pendingSwitch, grouped.yourActive, currentUser, navigate]);

  const handleCompletedClick = useCallback((s: SessionRecord) => {
    const legacy = mockSessions.find((m) => m.id === s.id) ?? {
      id: s.id,
      name: s.name,
      status: "ended" as const,
      createdAt: s.createdAt,
      inputCount: s.lines.filter((l) => l.enabled).length,
      pin: s.pin,
      inputs: [],
    };
    setExpiredSession(legacy as Session);
  }, []);

  const handleDraftClick = useCallback((s: SessionRecord) => {
    navigate(`/session/${s.id}/configure`);
  }, [navigate]);


  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
            <p className="text-sm text-muted-foreground">
              Live operations board — what's being monitored right now
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5 border-border/40">
              <Link to="/join"><LogIn className="h-3.5 w-3.5" /> Join</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/create"><Plus className="h-3.5 w-3.5" /> Create</Link>
            </Button>
          </div>
        </div>

        {/* Your Active Session */}
        <section>
          <SectionHeader title="Your Active Session" count={grouped.yourActive ? 1 : 0} />
          {grouped.yourActive ? (
            <SessionCard
              session={grouped.yourActive}
              variant="hero"
              currentUserId={currentUser.id}
              onClick={() => handleActiveCardClick(grouped.yourActive!)}
            />
          ) : (
            <div className="mako-glass rounded-lg p-5 border border-dashed border-border/30 text-center">
              <Radio className="h-5 w-5 text-muted-foreground/60 mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">
                You aren't monitoring a session right now. Create one, join a team session below, or resume a draft.
              </p>
            </div>
          )}
        </section>

        {/* Team Active */}
        {grouped.teamActive.length > 0 && (
          <section>
            <SectionHeader title="Team Active Sessions" count={grouped.teamActive.length} />
            <div className="grid gap-3 md:grid-cols-2">
              {grouped.teamActive.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  variant="grid"
                  currentUserId={currentUser.id}
                  onClick={() => handleActiveCardClick(s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Drafts */}
        {grouped.drafts.length > 0 && (
          <section>
            <SectionHeader title="Drafts" count={grouped.drafts.length} />
            <div className="grid gap-3">
              {grouped.drafts.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  variant="grid"
                  currentUserId={currentUser.id}
                  onClick={() => handleDraftClick(s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {grouped.completed.length > 0 && (
          <section>
            <SectionHeader title="Recent Sessions" count={grouped.completed.length} />
            <div className="grid gap-3">
              {grouped.completed.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  variant="grid"
                  currentUserId={currentUser.id}
                  onClick={() => handleCompletedClick(s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Archived */}
        {grouped.archived.length > 0 && (
          <section>
            <SectionHeader
              title="Archived"
              count={grouped.archived.length}
              collapsible
              collapsed={!archivedOpen}
              onToggle={() => setArchivedOpen((o) => !o)}
            />
            {archivedOpen && (
              <div className="grid gap-3">
                {grouped.archived.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    variant="grid"
                    currentUserId={currentUser.id}
                    onClick={() => handleCompletedClick(s)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <SessionActionsDialog
          session={actionSession}
          currentUserId={currentUser.id}
          onClose={() => setActionSession(null)}
          onJoin={handleJoinFromDialog}
          onConfigure={handleConfigureFromDialog}
          joinLabel={grouped.yourActive?.id === actionSession?.id ? "Return to Session" : "Join Live Session"}
        />
        <SwitchMonitoringSessionDialog
          currentSession={grouped.yourActive}
          newSession={pendingSwitch}
          onCancel={() => setPendingSwitch(null)}
          onConfirm={confirmSwitch}
        />
        <ExpiredSessionDialog
          session={expiredSession}
          onClose={() => setExpiredSession(null)}
        />
      </div>
    </TooltipProvider>
  );
};

export default Sessions;
