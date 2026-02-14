import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertTriangle, Zap, ExternalLink, ShieldAlert } from "lucide-react";
import QuinnPanel from "@/components/quinn/QuinnPanel";
import IncidentDetailDrawer from "@/components/quinn/IncidentDetailDrawer";
import {
  getIncidents,
  type Incident,
  severityBg,
  statusBg,
  isOps,
  getCurrentUser,
} from "@/lib/quinn-store";
import { mockSessions } from "@/lib/mock-data";
import { useQuinnSimulator } from "@/hooks/use-quinn-simulator";

export default function OpsDashboard() {
  const user = getCurrentUser();
  const [incidents, setIncidents] = useState<Incident[]>(() => getIncidents());
  const [selected, setSelected] = useState<Incident | null>(null);

  const refresh = useCallback(() => setIncidents(getIncidents()), []);

  // Live simulation — refresh dashboard when new incidents arrive
  useQuinnSimulator(refresh);

  if (!isOps()) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
        <h1 className="text-lg font-medium text-foreground">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">The Ops Dashboard requires the <span className="text-primary">ops</span> role.</p>
      </div>
    );
  }

  const activeSessions = mockSessions.filter((s) => s.status === "live");
  const openIncidents = incidents.filter((i) => i.status === "open");
  const criticalNow = incidents.filter((i) => i.severity === "critical" && i.status === "open");

  const worstSeverity = (sessionId: string) => {
    const si = incidents.filter((i) => i.sessionId === sessionId && i.status !== "resolved");
    if (si.some((i) => i.severity === "critical")) return "critical";
    if (si.some((i) => i.severity === "warn")) return "warn";
    if (si.length > 0) return "info";
    return null;
  };

  const lastIncidentTime = (sessionId: string) => {
    const si = incidents.filter((i) => i.sessionId === sessionId).sort((a, b) => b.startedAtUtc.localeCompare(a.startedAtUtc));
    if (si.length === 0) return "—";
    return new Date(si[0].startedAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)]">
      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <h1 className="text-sm font-medium text-foreground">Ops Dashboard</h1>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={<Activity className="h-4 w-4 text-primary" />} label="Active Sessions" value={activeSessions.length} />
          <KpiCard icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />} label="Open Incidents" value={openIncidents.length} />
          <KpiCard icon={<Zap className="h-4 w-4 text-destructive" />} label="Critical Now" value={criticalNow.length} />
        </div>

        {/* Sessions table */}
        <div className="mako-glass rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sessions</p>
          </div>
          <ScrollArea className="max-h-[240px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/10">
                  <th className="text-left px-3 py-2 font-medium">Session</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Lines</th>
                  <th className="text-left px-3 py-2 font-medium">Severity</th>
                  <th className="text-left px-3 py-2 font-medium">Last Incident</th>
                  <th className="text-right px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {mockSessions.map((s) => {
                  const sev = worstSeverity(s.id);
                  return (
                    <tr key={s.id} className="border-b border-border/5 hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2 text-foreground font-medium truncate max-w-[200px]">{s.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] border-0 ${s.status === "live" ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{s.inputCount}</td>
                      <td className="px-3 py-2">
                        {sev ? <Badge className={`${severityBg[sev]} text-[10px] uppercase border-0`}>{sev}</Badge> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{lastIncidentTime(s.id)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/session/${s.id}`}>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                            Open <ExternalLink className="h-3 w-3" />
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

        {/* Global incident stream */}
        <div className="mako-glass rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/10">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Incident Stream</p>
          </div>
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1.5">
              {incidents
                .sort((a, b) => b.startedAtUtc.localeCompare(a.startedAtUtc))
                .map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => setSelected(inc)}
                    className="w-full text-left p-2 rounded bg-muted/10 hover:bg-muted/20 border border-border/10 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge className={`${severityBg[inc.severity]} text-[10px] uppercase border-0`}>{inc.severity}</Badge>
                      <Badge className={`${statusBg[inc.status]} text-[10px] uppercase border-0`}>{inc.status}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(inc.startedAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-xs text-foreground/90 line-clamp-1">{inc.summary}</p>
                    <p className="text-[10px] text-muted-foreground">{inc.sessionName} · {inc.primaryLineLabel}</p>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Quinn Ops panel */}
      <div className="w-72 shrink-0 mako-glass rounded-lg overflow-hidden hidden lg:flex flex-col">
        <QuinnPanel />
      </div>

      <IncidentDetailDrawer
        incident={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        canManage={user.role === "ops"}
        onStatusChange={refresh}
      />
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
