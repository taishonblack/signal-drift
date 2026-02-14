import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, LogIn, Radio, Clock, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { mockSessions, type Session } from "@/lib/mock-data";
import ExpiredSessionDialog from "@/components/ExpiredSessionDialog";

const PAGE_SIZE = 10;

const Sessions = () => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expiredSession, setExpiredSession] = useState<Session | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const visibleSessions = mockSessions.slice(0, visibleCount);
  const hasMore = visibleCount < mockSessions.length;

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, mockSessions.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  const handleSessionClick = useCallback(
    (e: React.MouseEvent, session: Session) => {
      if (session.status === "ended") {
        e.preventDefault();
        setExpiredSession(session);
      }
    },
    []
  );

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
            <p className="text-sm text-muted-foreground">Review and monitor live signal sessions</p>
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

        <div className="grid gap-3">
          {visibleSessions.map((session) => {
            const isEnded = session.status === "ended";
            const isLive = session.status === "live";

            return (
              <Link
                key={session.id}
                to={isEnded ? "#" : `/session/${session.id}`}
                onClick={(e) => handleSessionClick(e, session)}
                className={`mako-glass rounded-lg p-4 flex items-center justify-between gap-4 transition-all group ${
                  isEnded
                    ? "hover:bg-muted/10 cursor-pointer"
                    : "hover:bg-muted/20 hover:translate-y-[-1px]"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {isLive ? (
                      <Badge variant="default" className="gap-1 text-[10px] px-1.5 py-0 h-5 font-semibold">
                        <Radio className="h-3 w-3" /> Live
                      </Badge>
                    ) : session.status === "scheduled" ? (
                      <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-5 font-semibold text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
                        <Clock className="h-3 w-3" /> Scheduled
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-5 font-semibold text-muted-foreground">
                        <FileText className="h-3 w-3" /> Report
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate transition-colors ${
                      isEnded
                        ? "text-muted-foreground group-hover:text-foreground/80"
                        : "text-foreground group-hover:text-primary"
                    }`}>
                      {session.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.inputCount} input{session.inputCount !== 1 ? "s" : ""} · PIN {session.pin}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </span>
                  {isEnded && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                          <Download className="h-3.5 w-3.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Download report</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            <span className="text-xs text-muted-foreground animate-pulse">Loading more sessions…</span>
          </div>
        )}

        {!hasMore && mockSessions.length > PAGE_SIZE && (
          <p className="text-center text-xs text-muted-foreground py-2">
            All {mockSessions.length} sessions loaded
          </p>
        )}

        <ExpiredSessionDialog
          session={expiredSession}
          onClose={() => setExpiredSession(null)}
        />
      </div>
    </TooltipProvider>
  );
};

export default Sessions;
