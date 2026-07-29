import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import DemoShell from "@/components/demo/DemoShell";
import { useDemo, trackDemoEvent } from "@/contexts/DemoModeProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, CheckCircle2, Zap } from "lucide-react";
import type { DemoTimelineEntry } from "@/lib/demo/demo-data";

interface DemoIncident {
  id: string;
  severity: "warning" | "critical";
  status: DemoTimelineEntry["status"];
  sourceName: string;
  message: string;
  occurrences: number;
  lastSeen: string;
  confidence?: number;
}

export default function ExploreOps() {
  const { timeline, setEntryStatus, config } = useDemo();

  useEffect(() => {
    document.title = "Demo — Operations | MAKO";
    trackDemoEvent("ops_viewed");
  }, []);

  const incidents = useMemo<DemoIncident[]>(() => {
    const map = new Map<string, DemoIncident>();
    for (const e of timeline) {
      if (e.severity !== "warning" && e.severity !== "critical") continue;
      const key = `${e.sourceId ?? "session"}:${e.severity}:${e.message.slice(0, 24)}`;
      const existing = map.get(key);
      if (existing) {
        existing.occurrences += 1;
        return_if_newer(existing, e);
      } else {
        map.set(key, {
          id: e.id,
          severity: e.severity,
          status: e.status,
          sourceName: e.sourceName ?? "Session",
          message: e.message,
          occurrences: 1,
          lastSeen: e.createdAt,
          confidence: e.confidence,
        });
      }
    }
    return [...map.values()].sort((a, b) => +new Date(b.lastSeen) - +new Date(a.lastSeen));
  }, [timeline]);

  const openCount = incidents.filter((i) => i.status === "open").length;
  const criticalCount = incidents.filter((i) => i.severity === "critical" && i.status === "open").length;

  return (
    <DemoShell stage="respond">
      <div className="mx-auto max-w-5xl space-y-4">
        <header>
          <h1 className="text-lg font-medium text-foreground">Operations — Demo</h1>
          <p className="text-xs text-muted-foreground">
            Incidents derived from the demo timeline. Actions affect this browser tab only.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Active Sessions", "1"],
            ["Sources Monitored", String(config.sources.filter((s) => s.enabled).length)],
            ["Open Incidents", String(openCount)],
            ["Critical Now", String(criticalCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/20 bg-card/30 p-3 backdrop-blur-[18px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-light text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-lg border border-border/20 bg-card/30 p-3 backdrop-blur-[18px]">
          <h2 className="mb-2 text-sm font-medium text-foreground">Incident Stream</h2>
          {incidents.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground/60">No incidents in this demo yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {incidents.map((inc) => {
                const SevIcon = inc.severity === "critical" ? Zap : AlertTriangle;
                return (
                  <li key={inc.id} className="rounded border border-border/10 bg-muted/10 p-2.5">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        className={`inline-flex items-center gap-1 border-0 text-[10px] uppercase ${
                          inc.severity === "critical"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]"
                        }`}
                      >
                        <SevIcon className="h-3 w-3" /> {inc.severity}
                      </Badge>
                      <Badge className="border-0 bg-muted/40 text-[10px] uppercase text-muted-foreground">
                        {inc.status}
                      </Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(inc.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/95">{inc.message}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span>{inc.sourceName}</span>
                      <span>Occurrences: {inc.occurrences}</span>
                      {inc.confidence != null && <span>Confidence: {Math.round(inc.confidence * 100)}%</span>}
                    </div>
                    <div className="mt-2 flex gap-1.5 border-t border-border/10 pt-2">
                      {inc.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => {
                            setEntryStatus(inc.id, "ack");
                            trackDemoEvent("incident_acknowledged");
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Acknowledge
                        </Button>
                      )}
                      {inc.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => {
                            setEntryStatus(inc.id, "resolved");
                            trackDemoEvent("incident_resolved");
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Resolve
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-primary/25 bg-primary/[0.06] p-5 text-center">
          <h2 className="text-base font-medium text-foreground">Ready to monitor your own feeds?</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Create a real MAKO session with your own SRT sources — no account required to start.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild className="gap-2" onClick={() => trackDemoEvent("completed_cta_clicked")}>
              <Link to="/create">
                Start a Real Session <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Return Home</Link>
            </Button>
          </div>
        </section>
      </div>
    </DemoShell>
  );
}

function return_if_newer(target: DemoIncident, e: DemoTimelineEntry) {
  if (+new Date(e.createdAt) > +new Date(target.lastSeen)) {
    target.lastSeen = e.createdAt;
    target.message = e.message;
    target.status = e.status;
  }
}
