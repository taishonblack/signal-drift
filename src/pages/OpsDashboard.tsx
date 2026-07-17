import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertTriangle, Zap, ExternalLink, Radio, LogIn, Plus } from "lucide-react";
import QuinnPanel from "@/components/quinn/QuinnPanel";
import IncidentCard from "@/components/quinn/IncidentCard";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useAuth } from "@/hooks/useAuth";
import { useSessionTimeline } from "@/hooks/use-session-timeline";
import { useQuinnIncidents, type QuinnIncident } from "@/hooks/use-quinn-incidents";
import { useIdentity } from "@/lib/identity";

export default function OpsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const identity = useIdentity();
  const { session, isTemporary } = useCurrentSession();
  const sessionId = session?.id;
  const timeline = useSessionTimeline(sessionId, { user, loading: authLoading });
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("incident");
  const navigate = useNavigate();

  const postSystemEntry = useCallback(
    (message: string) => {
      void timeline.addEntry({ message, severity: "information", entryType: "session_event" });
    },
    [timeline],
  );

  const { incidents, openIncidents, criticalOpenIncidents, openCountsBySource, acknowledge, resolve } =
    useQuinnIncidents({
      sessionId,
      sessionName: session?.name ?? "",
      entries: timeline.entries,
      actorName: identity.name || "Operator",
      postSystemEntry,
    });

  // Empty state — no session in progress.
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center px-4">
        <Radio className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <h1 className="text-base font-medium text-foreground">No monitoring session selected</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start a session or join one before opening Ops.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/create"><Plus className="h-3.5 w-3.5" /> Start Monitoring</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5 border-border/40">
            <Link to="/join"><LogIn className="h-3.5 w-3.5" /> Join Session</Link>
          </Button>
        </div>
      </div>
    );
  }

  const enabledSources = session.lines.filter((l) => l.enabled);

  const filteredIncidents = useMemo(() => {
    if (!sourceFilter) return incidents;
    return incidents.filter((i) => (i.sourceId ?? i.sourceName) === sourceFilter);
  }, [incidents, sourceFilter]);

  const handleViewTimeline = (incident: QuinnIncident) => {
    navigate(`/session/${session.id}?timelineEntry=${incident.latestEntryId}`);
  };

  const isLoading = timeline.loading && !timeline.ready;

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)]">
      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-foreground truncate">
              Ops · {session.name}
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Session ID <span className="font-mono">{session.id}</span> ·{" "}
              {enabledSources.length} source{enabledSources.length === 1 ? "" : "s"} ·{" "}
              {isTemporary ? "Temporary" : "Saved"}
            </p>
          </div>
          <Link to={`/session/${session.id}`}>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-border/40">
              <Radio className="h-3.5 w-3.5" /> Return to Session
            </Button>
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={<Activity className="h-4 w-4 text-primary" />} label="Sources Monitored" value={enabledSources.length} />
          <KpiCard icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />} label="Open Incidents" value={openIncidents.length} />
          <KpiCard icon={<Zap className="h-4 w-4 text-destructive" />} label="Critical Now" value={criticalOpenIncidents.length} />
        </div>

        {/* Sources */}
        <div className="mako-glass rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border/10 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex-1">
              Sources in this session
            </p>
            {sourceFilter && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSourceFilter(null)}>
                Clear filter
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[240px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/10">
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-left px-3 py-2 font-medium">Address</th>
                  <th className="text-left px-3 py-2 font-medium">Open Incidents</th>
                  <th className="text-right px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {enabledSources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground/60">
                      No sources configured yet.
                    </td>
                  </tr>
                )}
                {enabledSources.map((l) => {
                  const isDefault = /^Line \d+$/.test(l.label);
                  const display = isDefault ? `Source ${l.id}` : l.label;
                  const openForLine = openCountsBySource[l.id] ?? 0;
                  const isFiltered = sourceFilter === l.id;
                  return (
                    <tr key={l.id} className={`border-b border-border/5 hover:bg-muted/10 transition-colors ${isFiltered ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2 text-foreground font-medium truncate max-w-[200px]">{display}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono truncate max-w-[240px]">{l.srtAddress || "—"}</td>
                      <td className="px-3 py-2">
                        {openForLine > 0 ? (
                          <button
                            onClick={() => setSourceFilter(isFiltered ? null : l.id)}
                            className="text-foreground font-medium hover:text-primary transition-colors"
                          >
                            {openForLine} Open Incident{openForLine === 1 ? "" : "s"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/session/${session.id}/configure`}>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                            Configure <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>

        {/* Incident stream */}
        <div className="mako-glass rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/10 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex-1">
              Incident Stream · {session.name}
              {sourceFilter && <span className="ml-2 text-primary normal-case tracking-normal">Filtered</span>}
            </p>
          </div>
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-2">
              {isLoading && (
                <p className="text-xs text-muted-foreground/60 text-center py-6">Loading incidents…</p>
              )}
              {!isLoading && timeline.error && (
                <p className="text-xs text-muted-foreground/60 text-center py-6">Incidents unavailable.</p>
              )}
              {!isLoading && !timeline.error && filteredIncidents.length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-6">
                  No incidents yet for this session.
                </p>
              )}
              {filteredIncidents.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  onAcknowledge={acknowledge}
                  onResolve={resolve}
                  onViewTimeline={handleViewTimeline}
                  highlighted={highlightId === inc.id || highlightId === inc.latestEntryId}
                  canManage
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Quinn Ops panel */}
      <div className="w-72 shrink-0 mako-glass rounded-lg overflow-hidden hidden lg:flex flex-col">
        <QuinnPanel
          sessionId={session.id}
          incidents={incidents}
          onSelectIncident={(id) => {
            const el = document.getElementById(`incident-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("incident", id);
              return next;
            });
          }}
        />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="mako-glass rounded-lg p-3 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-lg font-semibold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}
