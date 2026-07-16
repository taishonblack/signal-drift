import { Radio, Clock, PauseCircle, CheckCircle2, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/lib/session-store";

export type AnySessionStatus =
  | SessionStatus
  | "live" // legacy alias
  | "ended" // legacy alias
  | "expired"; // legacy alias

const normalize = (s: AnySessionStatus): SessionStatus => {
  if (s === "live") return "active";
  if (s === "ended" || s === "expired") return "completed";
  return s;
};

const config: Record<
  SessionStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "bg-transparent text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40",
  },
  active: {
    label: "Active",
    icon: Radio,
    className: "bg-primary/15 text-primary border-primary/30",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    className: "bg-muted/25 text-muted-foreground border-border/25",
  },
  completed: {
    label: "Ended",
    icon: CheckCircle2,
    className: "bg-transparent text-muted-foreground border-border/25",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    className: "bg-transparent text-muted-foreground/60 border-border/20",
  },
};

interface Props {
  status: AnySessionStatus;
  className?: string;
}

const SessionStatusBadge = ({ status, className }: Props) => {
  const s = normalize(status);
  const c = config[s];
  const Icon = c.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] px-1.5 py-0 h-5 font-semibold whitespace-nowrap",
        c.className,
        className
      )}
    >
      <Icon className="h-3 w-3" /> {c.label}
    </Badge>
  );
};

export default SessionStatusBadge;
