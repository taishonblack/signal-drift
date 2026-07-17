import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import type { QuinnIncident } from "@/hooks/use-quinn-incidents";

const severityBg: Record<QuinnIncident["severity"], string> = {
  warn: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  critical: "bg-destructive/15 text-destructive",
};

const statusBg: Record<QuinnIncident["status"], string> = {
  open: "bg-destructive/15 text-destructive",
  ack: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  resolved: "bg-primary/15 text-primary",
};

const eventTypeLabels: Record<string, string> = {
  packet_loss_spike: "Packet Loss Spike",
  bitrate_drop: "Bitrate Drop",
  freeze_detected: "Freeze Detected",
  pts_jump: "PTS Discontinuity",
  audio_clipping: "Audio Clipping",
  black_frames: "Black Frames",
  resolution_change: "Resolution Change",
  codec_change: "Codec Change",
  signal_loss: "Signal Loss",
};

function formatEventType(type: string) {
  return eventTypeLabels[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ts(utc: string) {
  return new Date(utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function duration(fromIso: string, toIso: string) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

interface Props {
  incident: QuinnIncident;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onViewTimeline?: (incident: QuinnIncident) => void;
  compact?: boolean;
  highlighted?: boolean;
  canManage?: boolean;
}

export default function IncidentCard({
  incident,
  onAcknowledge,
  onResolve,
  onViewTimeline,
  compact,
  highlighted,
  canManage,
}: Props) {
  const SevIcon = incident.severity === "critical" ? Zap : AlertTriangle;
  return (
    <div
      id={`incident-${incident.id}`}
      className={`p-2.5 rounded border transition-colors ${
        highlighted
          ? "bg-primary/10 border-primary/40"
          : "bg-muted/10 border-border/10 hover:bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Badge className={`${severityBg[incident.severity]} text-[10px] uppercase border-0 gap-1 inline-flex items-center`}>
          <SevIcon className="h-3 w-3" /> {incident.severity === "warn" ? "warning" : "critical"}
        </Badge>
        <Badge className={`${statusBg[incident.status]} text-[10px] uppercase border-0`}>{incident.status}</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">{ts(incident.lastSeenAt)}</span>
      </div>
      <p className="text-xs font-medium text-foreground/95">{formatEventType(incident.eventType)}</p>
      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{incident.latestMessage}</p>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
        <span>{incident.sourceName}</span>
        <span>Duration: {duration(incident.firstSeenAt, incident.lastSeenAt)}</span>
        <span>Occurrences: {incident.occurrenceCount}</span>
        {incident.confidence != null && (
          <span>Confidence: {Math.round(incident.confidence * 100)}%</span>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/10">
          {canManage && incident.status === "open" && onAcknowledge && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onAcknowledge(incident.id)}>
              <CheckCircle2 className="h-3 w-3" /> Acknowledge
            </Button>
          )}
          {canManage && incident.status !== "resolved" && onResolve && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onResolve(incident.id)}>
              <CheckCircle2 className="h-3 w-3" /> Resolve
            </Button>
          )}
          {onViewTimeline && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1 ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => onViewTimeline(incident)}
            >
              View in Timeline <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
