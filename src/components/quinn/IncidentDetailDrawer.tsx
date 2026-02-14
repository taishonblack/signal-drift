import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle2, AlertTriangle, Info, Zap, FileText } from "lucide-react";
import { generateIncidentPDF } from "@/lib/quinn-pdf";
import {
  type Incident,
  type QuinnEvent,
  getEventsForIncident,
  updateIncidentStatus,
  exportIncidentReport,
  severityBg,
  statusBg,
} from "@/lib/quinn-store";
import { useState, useEffect } from "react";

const eventTypeLabels: Record<string, string> = {
  packet_loss_spike: "Packet Loss Spike",
  bitrate_drop: "Bitrate Drop",
  freeze_detected: "Freeze Detected",
  pts_jump: "PTS Jump",
  audio_clipping: "Audio Clipping",
  black_frames: "Black Frames",
  resolution_change: "Resolution Change",
  codec_change: "Codec Change",
};

const SeverityIcon = ({ severity }: { severity: string }) => {
  if (severity === "critical") return <Zap className="h-3.5 w-3.5" />;
  if (severity === "warn") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
};

interface Props {
  incident: Incident | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onStatusChange?: () => void;
}

export default function IncidentDetailDrawer({ incident, open, onClose, canManage, onStatusChange }: Props) {
  const [events, setEvents] = useState<QuinnEvent[]>([]);

  useEffect(() => {
    if (incident) setEvents(getEventsForIncident(incident.id));
  }, [incident]);

  if (!incident) return null;

  const handleStatus = (status: "ack" | "resolved") => {
    updateIncidentStatus(incident.id, status);
    onStatusChange?.();
    if (status === "resolved") onClose();
  };

  const handleExportJson = () => {
    const json = exportIncidentReport(incident.id);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-${incident.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    generateIncidentPDF(incident);
  };

  const ts = (utc: string) => {
    const d = new Date(utc);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="mako-glass-solid border-border/20 w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Badge className={`${severityBg[incident.severity]} text-[10px] uppercase border-0`}>
              {incident.severity}
            </Badge>
            <Badge className={`${statusBg[incident.status]} text-[10px] uppercase border-0`}>
              {incident.status}
            </Badge>
          </div>
          <SheetTitle className="text-sm text-foreground mt-2">{incident.summary}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 text-xs">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            <div>Session <span className="text-foreground">{incident.sessionName}</span></div>
            <div>Line <span className="text-foreground">{incident.primaryLineLabel}</span></div>
            <div>Started <span className="text-foreground">{ts(incident.startedAtUtc)}</span></div>
            <div>Ended <span className="text-foreground">{incident.endedAtUtc ? ts(incident.endedAtUtc) : "Ongoing"}</span></div>
          </div>

          {/* Events */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Events ({events.length})</p>
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="p-2 rounded bg-muted/20 border border-border/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={severityBg[ev.severity] + " px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1"}>
                      <SeverityIcon severity={ev.severity} />
                      {eventTypeLabels[ev.type] ?? ev.type}
                    </span>
                    <span className="text-muted-foreground ml-auto">{ts(ev.tsUtc)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {Object.entries(ev.evidence).map(([k, v]) => (
                      <span key={k} className="mr-3">
                        <span className="text-foreground/70">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border/10">
            {canManage && incident.status === "open" && (
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleStatus("ack")}>
                <CheckCircle2 className="h-3 w-3" /> Acknowledge
              </Button>
            )}
            {canManage && incident.status !== "resolved" && (
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleStatus("resolved")}>
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-xs gap-1 ml-auto" onClick={handleExportPdf}>
              <FileText className="h-3 w-3" /> PDF
            </Button>
            <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={handleExportJson}>
              <Download className="h-3 w-3" /> JSON
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
