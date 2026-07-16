import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import SessionCard from "@/components/session/SessionCard";
import JoinActiveSessionDialog from "@/components/session/JoinActiveSessionDialog";
import SwitchMonitoringSessionDialog from "@/components/session/SwitchMonitoringSessionDialog";
import ExpiredSessionDialog from "@/components/ExpiredSessionDialog";
import { mockSessions, type Session } from "@/lib/mock-data";
import { DEMO_DATA_ENABLED } from "@/lib/demo-flag";


const LS_KEY = "mako_recent_sessions_collapsed";

function getDefaultCollapsed(pathname: string): boolean {
  return pathname.startsWith("/session/");
}

function readPref(pathname: string): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw !== null) return JSON.parse(raw);
  } catch {}
  return getDefaultCollapsed(pathname);
}

interface Props {
  sidebarCollapsed?: boolean;
}

const RecentSessionsPanel = ({ sidebarCollapsed }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const currentUser = getCurrentUserRef();
  const [collapsed, setCollapsed] = useState(() => readPref(location.pathname));

  const [sessions, setSessions] = useState<SessionRecord[]>(() => getSessions());
  const [pendingJoin, setPendingJoin] = useState<SessionRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<SessionRecord | null>(null);
  const [expiredSession, setExpiredSession] = useState<Session | null>(null);
  const [expiredIsOwner, setExpiredIsOwner] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith("/session/")) {
      setCollapsed(true);
      localStorage.setItem(LS_KEY, "true");
    }
  }, [location.pathname]);

  useEffect(() => {
    const id = window.setInterval(() => setSessions(getSessions()), 2500);
    return () => window.clearInterval(id);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const grouped = useMemo(() => groupSessions(sessions, currentUser.id), [sessions, currentUser.id]);

  const handleActiveClick = (s: SessionRecord) => {
    if (grouped.yourActive?.id === s.id) {
      navigate(`/session/${s.id}`);
    } else if (grouped.yourActive) {
      setPendingSwitch(s);
    } else {
      setPendingJoin(s);
    }
  };

  const confirmJoin = () => {
    if (!pendingJoin) return;
    joinSession(pendingJoin.id, currentUser);
    const id = pendingJoin.id;
    setPendingJoin(null);
    navigate(`/session/${id}`);
  };

  const confirmSwitch = () => {
    if (!pendingSwitch || !grouped.yourActive) return;
    const current = grouped.yourActive;
    const isOwner = (current.ownerUserId ?? current.hostUserId) === currentUser.id;
    if (isOwner) endSession(current.id);
    else leaveSession(current.id, currentUser.id);
    joinSession(pendingSwitch.id, currentUser);
    const id = pendingSwitch.id;
    setPendingSwitch(null);
    navigate(`/session/${id}`);
  };

  const handleCompletedClick = (s: SessionRecord) => {
    const legacy = mockSessions.find((m) => m.id === s.id) ?? {
      id: s.id, name: s.name, status: "ended" as const,
      createdAt: s.createdAt, inputCount: s.lines.filter((l) => l.enabled).length,
      pin: s.pin, inputs: [],
    };
    setExpiredIsOwner((s.ownerUserId ?? s.hostUserId) === currentUser.id);
    setExpiredSession(legacy as Session);
  };

  if (sidebarCollapsed) return null;

  const teamActive = DEMO_DATA_ENABLED ? grouped.teamActive : [];
  const activeList = [
    ...(grouped.yourActive ? [grouped.yourActive] : []),
    ...teamActive,
  ];
  const total =
    activeList.length + grouped.completed.slice(0, 5).length;

  const Group = ({ title, items, onItemClick }: { title: string; items: SessionRecord[]; onItemClick: (s: SessionRecord) => void }) => (
    items.length > 0 ? (
      <div className="mt-1">
        <p className="px-2 pt-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          {title}
        </p>
        {items.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            variant="compact"
            currentUserId={currentUser.id}
            onClick={() => onItemClick(s)}
          />
        ))}
      </div>
    ) : null
  );

  return (
    <TooltipProvider>
      <div className="border-t border-border/20 mt-auto">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
          />
          <span>Recent</span>
          {collapsed && (
            <span className="ml-auto text-[10px] text-muted-foreground/50">{total}</span>
          )}
        </button>

        {!collapsed && (
          <div className="px-2 pb-2 space-y-0.5 max-h-72 overflow-y-auto">
            <Group title="Active" items={activeList} onItemClick={handleActiveClick} />
            {identity.kind === "member" ? (
              <>
                <Group title="Recent" items={grouped.completed.slice(0, 5)} onItemClick={handleCompletedClick} />
              </>
            ) : (
              <div className="mt-2 mx-1 rounded-md border border-dashed border-border/30 p-3 text-center">
                <p className="text-[11px] text-foreground/80">No saved sessions yet.</p>
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1">
                  Sign in to keep your monitoring history.
                </p>
                <Link to="/account?mode=login" className="text-[10px] text-primary hover:underline mt-1 inline-block">
                  Sign In
                </Link>
              </div>
            )}
          </div>
        )}


        <JoinActiveSessionDialog
          session={pendingJoin}
          onCancel={() => setPendingJoin(null)}
          onConfirm={confirmJoin}
        />
        <SwitchMonitoringSessionDialog
          currentSession={grouped.yourActive}
          newSession={pendingSwitch}
          onCancel={() => setPendingSwitch(null)}
          onConfirm={confirmSwitch}
        />
        <ExpiredSessionDialog
          session={expiredSession}
          isOwner={expiredIsOwner}
          onClose={() => setExpiredSession(null)}
        />
      </div>
    </TooltipProvider>
  );
};

export default RecentSessionsPanel;
