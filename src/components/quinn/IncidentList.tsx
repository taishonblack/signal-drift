import { Badge } from "@/components/ui/badge";
import { type Incident, severityBg, statusBg } from "@/lib/quinn-store";
import { Zap, AlertTriangle, Info } from "lucide-react";

const SeverityIcon = ({ severity }: { severity: string }) => {
  if (severity === "critical") return <Zap className="h-3 w-3" />;
  if (severity === "warn") return <AlertTriangle className="h-3 w-3" />;
  return <Info className="h-3 w-3" />;
};

interface Props {
  incidents: Incident[];
  onSelect: (incident: Incident) => void;
}

export default function IncidentList({ incidents, onSelect }: Props) {
  if (incidents.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No incidents recorded.</p>;
  }

  const ts = (utc: string) => new Date(utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-1.5">
      {incidents.map((inc) => (
        <button
          key={inc.id}
          onClick={() => onSelect(inc)}
          className="w-full text-left p-2.5 rounded bg-muted/10 hover:bg-muted/20 border border-border/10 transition-colors group"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`${severityBg[inc.severity]} text-[10px] uppercase border-0 gap-1 inline-flex items-center`}>
              <SeverityIcon severity={inc.severity} />
              {inc.severity}
            </Badge>
            <Badge className={`${statusBg[inc.status]} text-[10px] uppercase border-0`}>
              {inc.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">{ts(inc.startedAtUtc)}</span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{inc.summary}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{inc.primaryLineLabel} · {inc.sessionName}</p>
        </button>
      ))}
    </div>
  );
}
