import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Radio, FileText, Clock, Download } from "lucide-react";
import { mockSessions, type Session } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import ExpiredSessionDialog from "@/components/ExpiredSessionDialog";

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
  const [collapsed, setCollapsed] = useState(() => readPref(location.pathname));
  const [expiredSession, setExpiredSession] = useState<Session | null>(null);

  // Auto-collapse when navigating into a session
  useEffect(() => {
    if (location.pathname.startsWith("/session/")) {
      setCollapsed(true);
      localStorage.setItem(LS_KEY, "true");
    }
  }, [location.pathname]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent, session: Session) => {
    if (session.status === "ended") {
      e.preventDefault();
      setExpiredSession(session);
    }
  }, []);

  if (sidebarCollapsed) return null;

  const recentSessions = mockSessions.slice(0, 6);

  return (
    <TooltipProvider>
      <div className="border-t border-border/20 mt-auto">
        {/* Toggle header */}
        <button
          onClick={toggle}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
          />
          <span>Recent</span>
          {collapsed && (
            <span className="ml-auto text-[10px] text-muted-foreground/50">{recentSessions.length}</span>
          )}
        </button>

        {/* Expanded list */}
        {!collapsed && (
          <div className="px-2 pb-2 space-y-0.5 max-h-56 overflow-y-auto">
            {recentSessions.map((session) => {
              const isEnded = session.status === "ended";
              const isLive = session.status === "live";

              return (
                <Link
                  key={session.id}
                  to={isEnded ? "#" : `/session/${session.id}`}
                  onClick={(e) => handleClick(e, session)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group ${
                    isEnded
                      ? "text-muted-foreground hover:bg-muted/15 hover:text-foreground/70"
                      : "text-foreground/80 hover:bg-muted/20 hover:text-foreground"
                  }`}
                >
                  {isLive ? (
                    <Radio className="h-2.5 w-2.5 text-primary shrink-0" />
                  ) : session.status === "scheduled" ? (
                    <Clock className="h-2.5 w-2.5 text-[hsl(var(--warning))] shrink-0" />
                  ) : (
                    <FileText className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{session.name}</span>
                  {isEnded && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Download className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-primary shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="right">Download report</TooltipContent>
                    </Tooltip>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <ExpiredSessionDialog
          session={expiredSession}
          onClose={() => setExpiredSession(null)}
        />
      </div>
    </TooltipProvider>
  );
};

export default RecentSessionsPanel;
